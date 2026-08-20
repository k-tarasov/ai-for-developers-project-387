package store

import (
	"sync"
	"testing"
	"time"

	"bookingapi/api"
	"bookingapi/internal/errors"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

func bookingAt(start time.Time, dur time.Duration, id byte) api.Booking {
	return api.Booking{
		Id:       openapi_types.UUID([16]byte{id}),
		StartsAt: start,
		EndsAt:   start.Add(dur),
	}
}

func TestConcurrentCreateBooking(t *testing.T) {
	s := New(5)
	start := time.Date(2024, 1, 1, 9, 0, 0, 0, time.UTC)
	dur := 30 * time.Minute

	const n = 20
	var wg sync.WaitGroup
	results := make([]*apperrors.Error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = s.CreateBooking(bookingAt(start, dur, byte(idx+1)))
		}(i)
	}
	wg.Wait()

	ok, busy := 0, 0
	for _, err := range results {
		if err == nil {
			ok++
		} else if err.Code == apperrors.SlotBusy {
			busy++
		} else {
			t.Fatalf("unexpected error %v", err)
		}
	}
	if ok != 1 {
		t.Fatalf("expected exactly 1 successful booking, got %d", ok)
	}
	if busy != n-1 {
		t.Fatalf("expected %d SLOT_BUSY, got %d", n-1, busy)
	}
	if len(s.BookingsAll()) != 1 {
		t.Fatalf("store must contain exactly 1 booking, got %d", len(s.BookingsAll()))
	}
}

func TestConcurrentCreateBookingAdjacentSlots(t *testing.T) {
	s := New(5)
	base := time.Date(2024, 1, 1, 9, 0, 0, 0, time.UTC)
	dur := 30 * time.Minute

	const n = 10
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// each goroutine targets a distinct non-overlapping slot
			off := time.Duration(i) * dur
			s.CreateBooking(bookingAt(base.Add(off), dur, byte(i+1)))
		}()
	}
	wg.Wait()

	if len(s.BookingsAll()) != n {
		t.Fatalf("expected %d non-overlapping bookings, got %d", n, len(s.BookingsAll()))
	}
}
