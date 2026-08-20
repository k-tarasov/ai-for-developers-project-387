package store

import (
	"sort"
	"sync"
	"time"

	"bookingapi/api"
	"bookingapi/internal/errors"
)

type Store struct {
	mu               sync.RWMutex
	eventTypes       map[string]api.EventType
	schedule         api.WeeklySchedule
	bookings         map[string]api.Booking
	guests           map[string]api.GuestProfile
	ownerSessions    map[string]bool
	failedAttempts   int
	loginMaxAttempts int
}

// defaultAvailability — расписание 09:00–21:00 на каждый день недели.
func defaultAvailability() *api.WeeklySchedule {
	iv := []api.TimeInterval{{Start: "09:00", End: "21:00"}}
	return &api.WeeklySchedule{
		Mon: iv, Tue: iv, Wed: iv, Thu: iv, Fri: iv, Sat: iv, Sun: iv,
	}
}

var predefinedEventTypes = []api.EventType{
	{
		Id:               "15-min",
		Title:            "Встреча 15 минут",
		Description:      "Короткая встреча на 15 минут.",
		DurationMinutes:  15,
		Availability:     defaultAvailability(),
	},
	{
		Id:               "30-min",
		Title:            "Встреча 30 минут",
		Description:      "Стандартная встреча на 30 минут.",
		DurationMinutes:  30,
		Availability:     defaultAvailability(),
	},
}

func New(loginMaxAttempts int) *Store {
	s := &Store{
		eventTypes:       make(map[string]api.EventType),
		schedule:         api.WeeklySchedule{},
		bookings:         make(map[string]api.Booking),
		guests:           make(map[string]api.GuestProfile),
		ownerSessions:    make(map[string]bool),
		loginMaxAttempts: loginMaxAttempts,
	}
	for _, et := range predefinedEventTypes {
		s.eventTypes[et.Id] = et
	}
	return s
}

// --- Event types ---

func (s *Store) EventTypesList() []api.EventType {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]api.EventType, 0, len(s.eventTypes))
	for _, et := range s.eventTypes {
		out = append(out, et)
	}
	return out
}

func (s *Store) EventTypeGet(id string) (api.EventType, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	et, ok := s.eventTypes[id]
	return et, ok
}

func (s *Store) EventTypeExists(id string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.eventTypes[id]
	return ok
}

func (s *Store) EventTypeCreate(et api.EventType) *apperrors.Error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.eventTypes[et.Id]; ok {
		return apperrors.NewConflict(apperrors.DuplicateEventID, "event type id already exists")
	}
	s.eventTypes[et.Id] = et
	return nil
}

func (s *Store) EventTypeUpdate(id string, et api.EventType) (api.EventType, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.eventTypes[id]; !ok {
		return api.EventType{}, false
	}
	s.eventTypes[id] = et
	return et, true
}

func (s *Store) EventTypeDelete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.eventTypes[id]; !ok {
		return false
	}
	delete(s.eventTypes, id)
	return true
}

// --- Schedule ---

func (s *Store) ScheduleGet() api.WeeklySchedule {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.schedule
}

func (s *Store) ScheduleUpdate(ws api.WeeklySchedule) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.schedule = ws
}

// --- Bookings ---

// CreateBooking atomically checks for overlap and inserts. Returns SLOT_BUSY on conflict.
func (s *Store) CreateBooking(b api.Booking) *apperrors.Error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.bookings {
		if existing.StartsAt.Before(b.EndsAt) && existing.EndsAt.After(b.StartsAt) {
			return apperrors.NewConflict(apperrors.SlotBusy, "slot is already booked")
		}
	}
	s.bookings[b.Id.String()] = b
	return nil
}

func (s *Store) BookingsAll() []api.Booking {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]api.Booking, 0, len(s.bookings))
	for _, b := range s.bookings {
		out = append(out, b)
	}
	return out
}

func (s *Store) BookingsUpcoming(now time.Time) []api.Booking {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]api.Booking, 0, len(s.bookings))
	for _, b := range s.bookings {
		if b.StartsAt.After(now) || b.StartsAt.Equal(now) {
			out = append(out, b)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].StartsAt.Before(out[j].StartsAt)
	})
	return out
}

// --- Guests ---

func (s *Store) GuestCreate(gp api.GuestProfile) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.guests[gp.Id] = gp
}

func (s *Store) GuestGet(id string) (api.GuestProfile, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	gp, ok := s.guests[id]
	return gp, ok
}

func (s *Store) GuestUpdate(id string, gp api.GuestProfile) (api.GuestProfile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.guests[id]; !ok {
		return api.GuestProfile{}, false
	}
	s.guests[id] = gp
	return gp, true
}

// --- Owner session ---

func (s *Store) OwnerSessionCreate(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ownerSessions[token] = true
}

func (s *Store) OwnerSessionValid(token string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ownerSessions[token]
}

// --- Login throttle ---

func (s *Store) RegisterFailedAttempt() (count int, exceeded bool) {
	violated := false
	s.mu.Lock()
	s.failedAttempts++
	if s.failedAttempts >= s.loginMaxAttempts {
		violated = true
	}
	c := s.failedAttempts
	s.mu.Unlock()
	return c, violated
}

func (s *Store) ResetFailedAttempts() {
	s.mu.Lock()
	s.failedAttempts = 0
	s.mu.Unlock()
}
