//go:build windows

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"

	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	serviceName  = "LoginMonitor"
	pollInterval = 10 * time.Minute
)

type config struct {
	WebhookURL string `json:"webhook_url"`
}

type event struct {
	Time    time.Time `json:"time"`
	User    string    `json:"user,omitempty"`
	Address string    `json:"address,omitempty"`
	Result  string    `json:"result"`
	Message string    `json:"message,omitempty"`
}

type state struct {
	LastRecordID uint64  `json:"last_record_id"`
	Pending      []event `json:"pending"`
	HeartbeatDay string  `json:"heartbeat_day"`
}

type program struct {
	dir    string
	config config
	state  state
	logger *log.Logger
	mu     sync.Mutex
}

func main() {
	isService, err := svc.IsWindowsService()
	if err != nil {
		log.Fatal(err)
	}
	if isService {
		if err := svc.Run(serviceName, &service{}); err != nil {
			log.Fatal(err)
		}
		return
	}
	if len(os.Args) == 2 && os.Args[1] == "install" {
		if err := install(); err != nil {
			log.Fatal(err)
		}
		return
	}
	if len(os.Args) == 2 && os.Args[1] == "uninstall" {
		if err := uninstall(); err != nil {
			log.Fatal(err)
		}
		return
	}
	fmt.Printf("Usage: %s install|uninstall\n", filepath.Base(os.Args[0]))
}

type service struct{}

func (s *service) Execute(_ []string, requests <-chan svc.ChangeRequest, changes chan<- svc.Status) (bool, uint32) {
	changes <- svc.Status{State: svc.StartPending}
	p, err := newProgram()
	if err != nil {
		return false, 1
	}
	go p.run()
	changes <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for request := range requests {
		if request.Cmd == svc.Stop || request.Cmd == svc.Shutdown {
			changes <- svc.Status{State: svc.StopPending}
			return false, 0
		}
	}
	return false, 0
}

func newProgram() (*program, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	p := &program{dir: filepath.Dir(exe)}
	if err := p.load(); err != nil {
		return nil, err
	}
	p.logger = log.New(&rotatingWriter{dir: p.dir}, "", log.LstdFlags|log.LUTC)
	return p, nil
}

func (p *program) load() error {
	if err := readJSON(filepath.Join(p.dir, "config.json"), &p.config); err != nil && !os.IsNotExist(err) {
		return err
	}
	if err := readJSON(filepath.Join(p.dir, "state.json"), &p.state); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func readJSON(path string, target any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

func (p *program) save() error {
	data, err := json.MarshalIndent(p.state, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(p.dir, "state.json.tmp")
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(p.dir, "state.json"))
}

func (p *program) run() {
	p.queueStartup()
	p.cycle()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for range ticker.C {
		p.cycle()
	}
}

func (p *program) cycle() {
	p.mu.Lock()
	defer p.mu.Unlock()
	events, lastID, err := p.readLoginEvents()
	if err != nil {
		p.logger.Printf("read Windows Security events: %v", err)
	} else if len(events) > 0 {
		p.state.Pending = append(p.state.Pending, events...)
		p.state.LastRecordID = lastID
		if err := p.save(); err != nil {
			p.logger.Printf("save event state: %v", err)
			return
		}
	}
	p.queueHeartbeat()
	if len(p.state.Pending) == 0 || p.config.WebhookURL == "" {
		return
	}
	if err := sendWebhook(p.config.WebhookURL, p.state.Pending); err != nil {
		p.logger.Printf("send webhook: %v; retaining %d events", err, len(p.state.Pending))
		return
	}
	p.state.Pending = nil
	if err := p.save(); err != nil {
		p.logger.Printf("clear delivered events: %v", err)
	}
}

func (p *program) queueStartup() {
	if uptime() > 20*time.Minute {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.state.Pending = append(p.state.Pending, event{
		Time: time.Now().UTC(), Result: "startup", Message: "Windows restarted; login monitor is running.",
	})
	if err := p.save(); err != nil {
		p.logger.Printf("save startup event: %v", err)
	}
}

func (p *program) queueHeartbeat() {
	now := time.Now()
	today := now.Format("2006-01-02")
	if now.Hour() != 9 || p.state.HeartbeatDay == today {
		return
	}
	p.state.Pending = append(p.state.Pending, event{
		Time: now.UTC(), Result: "heartbeat", Message: "Login monitor is running normally.",
	})
	p.state.HeartbeatDay = today
	if err := p.save(); err != nil {
		p.logger.Printf("save heartbeat: %v", err)
	}
}

func (p *program) readLoginEvents() ([]event, uint64, error) {
	query := "*[System[(EventID=4624 or EventID=4625) and EventRecordID > " + strconv.FormatUint(p.state.LastRecordID, 10) + " and TimeCreated[timediff(@SystemTime) <= 660000]]]"
	command := fmt.Sprintf(`Get-WinEvent -LogName Security -FilterXPath '%s' -ErrorAction Stop | ForEach-Object { [PSCustomObject]@{ Id=$_.Id; RecordId=$_.RecordId; Time=$_.TimeCreated.ToUniversalTime().ToString('o'); User=$_.Properties[5].Value; Address=$_.Properties[19].Value } } | ConvertTo-Json -Compress`, query)
	out, err := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command).Output()
	if err != nil {
		return nil, p.state.LastRecordID, err
	}
	if len(bytes.TrimSpace(out)) == 0 {
		return nil, p.state.LastRecordID, nil
	}
	var records []struct {
		ID       int    `json:"Id"`
		RecordID uint64 `json:"RecordId"`
		Time     string `json:"Time"`
		User     string `json:"User"`
		Address  string `json:"Address"`
	}
	if bytes.HasPrefix(bytes.TrimSpace(out), []byte("{")) {
		var record struct {
			ID       int    `json:"Id"`
			RecordID uint64 `json:"RecordId"`
			Time     string `json:"Time"`
			User     string `json:"User"`
			Address  string `json:"Address"`
		}
		if err := json.Unmarshal(out, &record); err != nil {
			return nil, p.state.LastRecordID, err
		}
		records = []struct {
			ID       int    `json:"Id"`
			RecordID uint64 `json:"RecordId"`
			Time     string `json:"Time"`
			User     string `json:"User"`
			Address  string `json:"Address"`
		}{record}
	} else if err := json.Unmarshal(out, &records); err != nil {
		return nil, p.state.LastRecordID, err
	}
	lastID := p.state.LastRecordID
	events := make([]event, 0, len(records))
	for _, record := range records {
		at, err := time.Parse(time.RFC3339Nano, record.Time)
		if err != nil {
			continue
		}
		address := record.Address
		if address == "-" || address == "" {
			address = "127.0.0.1"
		}
		result := "success"
		if record.ID == 4625 {
			result = "failure"
		}
		events = append(events, event{Time: at, User: record.User, Address: address, Result: result})
		if record.RecordID > lastID {
			lastID = record.RecordID
		}
	}
	return events, lastID, nil
}

func sendWebhook(url string, events []event) error {
	body, err := json.Marshal(struct {
		Events []event `json:"events"`
	}{events})
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("unexpected HTTP status %s", response.Status)
	}
	return nil
}

func uptime() time.Duration {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	ticks, _, _ := kernel32.NewProc("GetTickCount64").Call()
	return time.Duration(ticks) * time.Millisecond
}

func install() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	manager, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer manager.Disconnect()
	service, err := manager.CreateService(serviceName, exe, mgr.Config{DisplayName: "Login Monitor", StartType: mgr.StartAutomatic})
	if err != nil {
		return fmt.Errorf("create service (run from an elevated terminal): %w", err)
	}
	defer service.Close()
	return service.Start()
}

func uninstall() error {
	manager, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer manager.Disconnect()
	service, err := manager.OpenService(serviceName)
	if err != nil {
		return err
	}
	defer service.Close()
	_, _ = service.Control(svc.Stop)
	return service.Delete()
}

type rotatingWriter struct{ dir string }

func (w *rotatingWriter) Write(data []byte) (int, error) {
	if err := os.MkdirAll(w.dir, 0755); err != nil {
		return 0, err
	}
	path := filepath.Join(w.dir, "login-monitor.log")
	if info, err := os.Stat(path); err == nil && info.Size()+int64(len(data)) > 20*1024*1024 {
		_ = os.Remove(path + ".1")
		if err := os.Rename(path, path+".1"); err != nil {
			return 0, err
		}
	}
	cutoff := time.Now().AddDate(0, 0, -30)
	for _, name := range []string{"login-monitor.log", "login-monitor.log.1"} {
		if info, err := os.Stat(filepath.Join(w.dir, name)); err == nil && info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(w.dir, name))
		}
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return 0, err
	}
	defer file.Close()
	return file.Write(data)
}
