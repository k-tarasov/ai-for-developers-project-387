package service

import (
	"sync"
	"testing"
	"time"

	"bookingapi/api"
	"bookingapi/internal/store"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

var mondayNoon = time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC) // 2024-01-01 is a Monday

func et(dur int32, avail *api.WeeklySchedule) api.EventType {
	return api.EventType{Id: "x", Title: "t", DurationMinutes: dur, Availability: avail}
}

func sched(days []api.TimeInterval) api.WeeklySchedule {
	return api.WeeklySchedule{Mon: days}
}

func TestSlotGrid15Min(t *testing.T) {
	iv := []api.TimeInterval{{Start: "09:00", End: "10:00"}}
	resp := ComputeSlots(et(30, nil), sched(iv), nil, mondayNoon)
	// 30-min slots in 09:00-10:00 => 3 per Monday; window has 2 Mondays (01-01, 01-08)
	if len(resp.Slots) != 6 {
		t.Fatalf("expected 6 slots, got %d: %+v", len(resp.Slots), resp.Slots)
	}
}

func TestWindow14Days(t *testing.T) {
	iv := []api.TimeInterval{{Start: "09:00", End: "10:00"}}
	ws := api.WeeklySchedule{
		Mon: iv, Tue: iv, Wed: iv, Thu: iv, Fri: iv, Sat: iv, Sun: iv,
	}
	resp := ComputeSlots(et(30, nil), ws, nil, mondayNoon)
	days := map[string]bool{}
	for _, s := range resp.Slots {
		days[s.StartsAt.Format("2006-01-02")] = true
	}
	if len(days) != 14 {
		t.Fatalf("expected 14 distinct days, got %d", len(days))
	}
	if resp.WindowStartsOn.Format("2006-01-02") != "2024-01-01" {
		t.Fatalf("unexpected window start %s", resp.WindowStartsOn)
	}
	if resp.WindowEndsOn.Format("2006-01-02") != "2024-01-14" {
		t.Fatalf("unexpected window end %s", resp.WindowEndsOn)
	}
}

func TestOverlapExcluded(t *testing.T) {
	iv := []api.TimeInterval{{Start: "09:00", End: "10:00"}}
	b := api.Booking{
		StartsAt: time.Date(2024, 1, 1, 9, 0, 0, 0, time.UTC),
		EndsAt:   time.Date(2024, 1, 1, 9, 30, 0, 0, time.UTC),
	}
	resp := ComputeSlots(et(30, nil), sched(iv), []api.Booking{b}, mondayNoon)
	// On 01-01: 09:00-09:30 and 09:15-09:45 overlap; 09:30-10:00 remains.
	// 01-08 (second Monday) is unaffected => 1 + 3 = 4 slots.
	if len(resp.Slots) != 4 {
		t.Fatalf("expected 4 slots, got %d: %+v", len(resp.Slots), resp.Slots)
	}
	for _, s := range resp.Slots {
		if s.StartsAt.Format("2006-01-02") == "2024-01-01" && (s.StartsAt.Hour() == 9 && s.StartsAt.Minute() == 0) {
			t.Fatalf("overlapped slot 09:00 on 01-01 should be excluded: %+v", s)
		}
	}
}

func TestEventTypeAvailabilityPriority(t *testing.T) {
	// owner schedule empty, event-type own availability on Monday
	own := sched([]api.TimeInterval{{Start: "09:00", End: "10:00"}})
	resp := ComputeSlots(et(30, &own), own, nil, mondayNoon)
	if len(resp.Slots) != 6 {
		t.Fatalf("expected 6 slots from event-type availability, got %d", len(resp.Slots))
	}
}

func TestValidateAlignmentAndWindow(t *testing.T) {
	ws := WindowStart(mondayNoon)
	if err := ValidateAlignmentAndWindow(time.Date(2024, 1, 1, 9, 1, 0, 0, time.UTC), ws); err == nil ||
		err.Code != "SLOT_MISALIGNED" {
		t.Fatalf("expected SLOT_MISALIGNED, got %v", err)
	}
	if err := ValidateAlignmentAndWindow(time.Date(2025, 1, 1, 9, 0, 0, 0, time.UTC), ws); err == nil ||
		err.Code != "SLOT_OUT_OF_WINDOW" {
		t.Fatalf("expected SLOT_OUT_OF_WINDOW, got %v", err)
	}
	if err := ValidateAlignmentAndWindow(time.Date(2024, 1, 1, 9, 0, 0, 0, time.UTC), ws); err != nil {
		t.Fatalf("expected valid, got %v", err)
	}
}

func TestIsWithinSchedule(t *testing.T) {
	iv := []api.TimeInterval{{Start: "09:00", End: "10:00"}}
	start := time.Date(2024, 1, 1, 8, 0, 0, 0, time.UTC)
	if err := IsWithinSchedule(et(30, nil), sched(iv), start, 30*time.Minute); err == nil ||
		err.Code != "SLOT_OUTSIDE_SCHEDULE" {
		t.Fatalf("expected SLOT_OUTSIDE_SCHEDULE, got %v", err)
	}
	start = time.Date(2024, 1, 1, 9, 0, 0, 0, time.UTC)
	if err := IsWithinSchedule(et(30, nil), sched(iv), start, 30*time.Minute); err != nil {
		t.Fatalf("expected within schedule, got %v", err)
	}
}

// TestConcurrentSlotsAndCreate mirrors the real request path: each goroutine
// reads free slots via ComputeSlots (a snapshot of existing bookings) and then
// attempts to book the same slot. Even though all goroutines observe the slot
// as free, the store's atomic CreateBooking must admit exactly one.
func TestConcurrentSlotsAndCreate(t *testing.T) {
	st := store.New(5)
	ws := api.WeeklySchedule{
		Mon: []api.TimeInterval{{Start: "09:00", End: "12:00"}},
		Tue: []api.TimeInterval{{Start: "09:00", End: "12:00"}},
		Wed: []api.TimeInterval{{Start: "09:00", End: "12:00"}},
		Thu: []api.TimeInterval{{Start: "09:00", End: "12:00"}},
		Fri: []api.TimeInterval{{Start: "09:00", End: "12:00"}},
		Sat: []api.TimeInterval{{Start: "09:00", End: "12:00"}},
		Sun: []api.TimeInterval{{Start: "09:00", End: "12:00"}},
	}
	eventType := et(30, nil)
	target := time.Date(2024, 1, 1, 9, 0, 0, 0, time.UTC) // Monday, in schedule, 15-min aligned

	const n = 20
	var wg sync.WaitGroup
	created := make([]bool, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			// snapshot of bookings exactly as the handler would feed ComputeSlots
			snapshot := st.BookingsAll()
			resp := ComputeSlots(eventType, ws, snapshot, target)
			found := false
			for _, s := range resp.Slots {
				if s.StartsAt.Equal(target) {
					found = true
					break
				}
			}
			if !found {
				return
			}
			dur := 30 * time.Minute
			b := api.Booking{
				Id:       openapi_types.UUID([16]byte{byte(idx)}),
				StartsAt: target,
				EndsAt:   target.Add(dur),
			}
			created[idx] = st.CreateBooking(b) == nil
		}(i)
	}
	wg.Wait()

	ok := 0
	for _, c := range created {
		if c {
			ok++
		}
	}
	if ok != 1 {
		t.Fatalf("expected exactly 1 successful booking under concurrency, got %d", ok)
	}
}
