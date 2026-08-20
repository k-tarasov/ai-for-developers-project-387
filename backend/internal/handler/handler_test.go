package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"bookingapi/api"
	"bookingapi/internal/config"
	"bookingapi/internal/store"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/go-chi/chi/v5"
	"log/slog"
)

func newTestServer(t *testing.T, loginMax int) (*httptest.Server, *store.Store) {
	t.Helper()
	st := store.New(loginMax)
	cfg := &config.Config{
		OwnerLogin:    "admin",
		OwnerPassword: "secret",
		ServerAddr:    ":0",
		LogLevel:      "info",
	}
	h := New(st, cfg, slog.Default())
	r := chi.NewRouter()
	r.Use(WithRequest)
	si := api.NewStrictHandler(h, nil)
	api.HandlerFromMuxWithBaseURL(si, r, "/api")
	return httptest.NewServer(r), st
}

func doReq(t *testing.T, client *http.Client, method, url string, body any) (*http.Response, []byte) {
	t.Helper()
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp, data
}

func newClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar}
}

func TestAuthLoginWrong(t *testing.T) {
	srv, _ := newTestServer(t, 5)
	defer srv.Close()
	resp, _ := doReq(t, newClient(), "POST", srv.URL+"/api/auth/login",
		api.OwnerLogin{Login: "admin", Password: "wrong"})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAuthLoginOK(t *testing.T) {
	srv, _ := newTestServer(t, 5)
	defer srv.Close()
	resp, _ := doReq(t, newClient(), "POST", srv.URL+"/api/auth/login",
		api.OwnerLogin{Login: "admin", Password: "secret"})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if resp.Cookies() == nil || len(resp.Cookies()) == 0 {
		t.Fatalf("expected owner_session cookie")
	}
}

func TestOwnerProtected(t *testing.T) {
	srv, _ := newTestServer(t, 5)
	defer srv.Close()
	resp, _ := doReq(t, newClient(), "POST", srv.URL+"/api/event-types",
		api.EventType{Id: "x", Title: "t", Description: "d", DurationMinutes: 30})
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestEventTypesLifecycle(t *testing.T) {
	srv, _ := newTestServer(t, 5)
	defer srv.Close()
	client := newClient()
	doReq(t, client, "POST", srv.URL+"/api/auth/login", api.OwnerLogin{Login: "admin", Password: "secret"})

	// invalid slug
	resp, _ := doReq(t, client, "POST", srv.URL+"/api/event-types",
		api.EventType{Id: "Bad ID", Title: "t", Description: "d", DurationMinutes: 30})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid slug, got %d", resp.StatusCode)
	}
	// invalid duration
	resp, _ = doReq(t, client, "POST", srv.URL+"/api/event-types",
		api.EventType{Id: "ok", Title: "t", Description: "d", DurationMinutes: 7})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid duration, got %d", resp.StatusCode)
	}
	// create
	resp, _ = doReq(t, client, "POST", srv.URL+"/api/event-types",
		api.EventType{Id: "ok", Title: "t", Description: "d", DurationMinutes: 30})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	// duplicate
	resp, _ = doReq(t, client, "POST", srv.URL+"/api/event-types",
		api.EventType{Id: "ok", Title: "t", Description: "d", DurationMinutes: 30})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected 409, got %d", resp.StatusCode)
	}
	// get missing
	resp, _ = doReq(t, client, "GET", srv.URL+"/api/event-types/missing", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestBookingValidation(t *testing.T) {
	srv, _ := newTestServer(t, 5)
	defer srv.Close()
	client := newClient()
	doReq(t, client, "POST", srv.URL+"/api/auth/login", api.OwnerLogin{Login: "admin", Password: "secret"})
	doReq(t, client, "POST", srv.URL+"/api/event-types",
		api.EventType{Id: "ok", Title: "t", Description: "d", DurationMinutes: 30})
	// full-week schedule so any weekday works
	full := []api.TimeInterval{{Start: "09:00", End: "12:00"}}
	doReq(t, client, "PUT", srv.URL+"/api/schedule",
		api.WeeklySchedule{Mon: full, Tue: full, Wed: full, Thu: full, Fri: full, Sat: full, Sun: full})

	// startsAt: 2 days from today at 09:00 UTC (future, in 14-day window)
	base := time.Now().UTC().Truncate(24 * time.Hour).Add(48 * time.Hour).Add(9 * time.Hour)

	// unknown event type
	resp, _ := doReq(t, client, "POST", srv.URL+"/api/bookings",
		api.BookingCreate{EventTypeId: "nope", StartsAt: base, GuestName: "a"})
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown event type, got %d", resp.StatusCode)
	}
	// missing contact
	resp, _ = doReq(t, client, "POST", srv.URL+"/api/bookings",
		api.BookingCreate{EventTypeId: "ok", StartsAt: base, GuestName: "a"})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing contact, got %d", resp.StatusCode)
	}
	// misaligned start (+1 min)
	resp, _ = doReq(t, client, "POST", srv.URL+"/api/bookings",
		api.BookingCreate{EventTypeId: "ok", StartsAt: base.Add(time.Minute), GuestName: "a", GuestEmail: ptrEmail("a@b.com")})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for misaligned start, got %d", resp.StatusCode)
	}
	// success
	resp, _ = doReq(t, client, "POST", srv.URL+"/api/bookings",
		api.BookingCreate{EventTypeId: "ok", StartsAt: base, GuestName: "a", GuestEmail: ptrEmail("a@b.com")})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	// busy
	resp, _ = doReq(t, client, "POST", srv.URL+"/api/bookings",
		api.BookingCreate{EventTypeId: "ok", StartsAt: base, GuestName: "a", GuestEmail: ptrEmail("a@b.com")})
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected 409 for busy slot, got %d", resp.StatusCode)
	}
	// list upcoming requires owner
	resp, _ = doReq(t, newClient(), "GET", srv.URL+"/api/bookings", nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for bookings list, got %d", resp.StatusCode)
	}
}

func TestConcurrentBookingSameSlot(t *testing.T) {
	srv, _ := newTestServer(t, 5)
	defer srv.Close()
	client := newClient()
	doReq(t, client, "POST", srv.URL+"/api/auth/login", api.OwnerLogin{Login: "admin", Password: "secret"})
	doReq(t, client, "POST", srv.URL+"/api/event-types",
		api.EventType{Id: "ok", Title: "t", Description: "d", DurationMinutes: 30})
	full := []api.TimeInterval{{Start: "09:00", End: "12:00"}}
	doReq(t, client, "PUT", srv.URL+"/api/schedule",
		api.WeeklySchedule{Mon: full, Tue: full, Wed: full, Thu: full, Fri: full, Sat: full, Sun: full})

	base := time.Now().UTC().Truncate(24 * time.Hour).Add(48 * time.Hour).Add(9 * time.Hour)
	body := api.BookingCreate{EventTypeId: "ok", StartsAt: base, GuestName: "a", GuestEmail: ptrEmail("a@b.com")}

	const n = 20
	codes := make(chan int, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resp, _ := doReq(t, newClient(), "POST", srv.URL+"/api/bookings", body)
			codes <- resp.StatusCode
		}()
	}
	wg.Wait()
	close(codes)

	created, busy := 0, 0
	for c := range codes {
		switch c {
		case http.StatusCreated:
			created++
		case http.StatusConflict:
			busy++
		default:
			t.Fatalf("unexpected status %d for concurrent booking", c)
		}
	}
	if created != 1 {
		t.Fatalf("expected exactly 1 successful booking, got %d", created)
	}
	if busy != n-1 {
		t.Fatalf("expected %d busy responses, got %d", n-1, busy)
	}
}

func TestLoginThrottle(t *testing.T) {
	srv, _ := newTestServer(t, 3)
	defer srv.Close()
	client := newClient()
	codes := []int{}
	for i := 0; i < 3; i++ {
		resp, _ := doReq(t, client, "POST", srv.URL+"/api/auth/login",
			api.OwnerLogin{Login: "admin", Password: "wrong"})
		codes = append(codes, resp.StatusCode)
	}
	if codes[0] != 401 || codes[1] != 401 || codes[2] != 429 {
		t.Fatalf("expected [401,401,429], got %v", codes)
	}
}

func TestGuestFlow(t *testing.T) {
	srv, _ := newTestServer(t, 5)
	defer srv.Close()
	client := newClient()
	// unknown without cookie
	resp, _ := doReq(t, client, "GET", srv.URL+"/api/guest", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for guest without cookie, got %d", resp.StatusCode)
	}
	// create guest
	resp, _ = doReq(t, client, "POST", srv.URL+"/api/guest",
		api.GuestCreate{Name: "Ivan", GuestEmail: ptrEmail("a@b.com"), RememberMe: true})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	if len(resp.Cookies()) == 0 {
		t.Fatalf("expected guest_id cookie")
	}
	// now known
	resp, _ = doReq(t, client, "GET", srv.URL+"/api/guest", nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func mustTime(t *testing.T, s string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func ptr(s string) *string { return &s }

func ptrEmail(s string) *openapi_types.Email { e := openapi_types.Email(s); return &e }
