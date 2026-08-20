package service

import (
	"sort"
	"time"

	"bookingapi/api"
	"bookingapi/internal/errors"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

const slotGrid = 15 * time.Minute

// WindowStart returns today's UTC midnight for the 14-day booking window.
func WindowStart(now time.Time) time.Time {
	return now.UTC().Truncate(24 * time.Hour)
}

// WindowEndExclusive returns the exclusive end of the 14-day window.
func WindowEndExclusive(windowStart time.Time) time.Time {
	return windowStart.AddDate(0, 0, 14)
}

// LastWindowDay returns the last inclusive day (windowStart + 13 days).
func LastWindowDay(windowStart time.Time) time.Time {
	return windowStart.AddDate(0, 0, 13)
}

func intervalsForWeekday(ws api.WeeklySchedule, wd time.Weekday) []api.TimeInterval {
	switch wd {
	case time.Monday:
		return ws.Mon
	case time.Tuesday:
		return ws.Tue
	case time.Wednesday:
		return ws.Wed
	case time.Thursday:
		return ws.Thu
	case time.Friday:
		return ws.Fri
	case time.Saturday:
		return ws.Sat
	case time.Sunday:
		return ws.Sun
	}
	return nil
}

func parseHHMM(day time.Time, s string) (time.Time, error) {
	t, err := time.Parse("15:04", s)
	if err != nil {
		return time.Time{}, err
	}
	return day.Add(time.Hour*time.Duration(t.Hour()) + time.Minute*time.Duration(t.Minute())), nil
}

func overlapsAny(start, end time.Time, bookings []api.Booking) bool {
	for _, b := range bookings {
		if b.StartsAt.Before(end) && b.EndsAt.After(start) {
			return true
		}
	}
	return false
}

// ComputeSlots returns free slots of length dur for the event type across the
// 14-day window, using the given schedule (owner default or event-type own).
func ComputeSlots(et api.EventType, schedule api.WeeklySchedule, bookings []api.Booking, now time.Time) api.SlotsResponse {
	windowStart := WindowStart(now)
	dur := time.Duration(et.DurationMinutes) * time.Minute

	// Пустой срез, а не nil: в JSON должен уходить [], иначе клиент получает null.
	slots := make([]api.Slot, 0)
	for d := 0; d <= 13; d++ {
		day := windowStart.AddDate(0, 0, d)
		intervals := intervalsForWeekday(schedule, day.Weekday())
		for _, iv := range intervals {
			ivStart, err1 := parseHHMM(day, iv.Start)
			ivEnd, err2 := parseHHMM(day, iv.End)
			if err1 != nil || err2 != nil {
				continue
			}
			cand := ivStart
			for {
				candEnd := cand.Add(dur)
				if !candEnd.After(ivStart) {
					cand = cand.Add(slotGrid)
					continue
				}
				if candEnd.After(ivEnd) {
					break
				}
				if !overlapsAny(cand, candEnd, bookings) {
					slots = append(slots, api.Slot{StartsAt: cand, EndsAt: candEnd})
				}
				cand = cand.Add(slotGrid)
			}
		}
	}
	sort.Slice(slots, func(i, j int) bool {
		return slots[i].StartsAt.Before(slots[j].StartsAt)
	})
	return api.SlotsResponse{
		WindowStartsOn: openapiDate(windowStart),
		WindowEndsOn:   openapiDate(LastWindowDay(windowStart)),
		Slots:          slots,
	}
}

// ValidateAlignmentAndWindow checks 15-min alignment and the 14-day window.
func ValidateAlignmentAndWindow(startsAt, windowStart time.Time) *apperrors.Error {
	if startsAt.Minute()%15 != 0 || startsAt.Second() != 0 || startsAt.Nanosecond() != 0 {
		return apperrors.NewBadRequest(apperrors.SlotMisaligned, "startsAt must be aligned to a 15-minute grid")
	}
	if startsAt.Before(windowStart) || !startsAt.Before(WindowEndExclusive(windowStart)) {
		return apperrors.NewBadRequest(apperrors.SlotOutOfWindow, "startsAt is outside the 14-day booking window")
	}
	return nil
}

// IsWithinSchedule verifies the interval [startsAt, startsAt+dur) fits entirely
// inside a working interval of the given schedule for that weekday.
func IsWithinSchedule(et api.EventType, schedule api.WeeklySchedule, startsAt time.Time, dur time.Duration) *apperrors.Error {
	day := startsAt.UTC().Truncate(24 * time.Hour)
	intervals := intervalsForWeekday(schedule, startsAt.Weekday())
	end := startsAt.Add(dur)
	for _, iv := range intervals {
		ivStart, err1 := parseHHMM(day, iv.Start)
		ivEnd, err2 := parseHHMM(day, iv.End)
		if err1 != nil || err2 != nil {
			continue
		}
		if !startsAt.Before(ivStart) && !end.After(ivEnd) {
			return nil
		}
	}
	return apperrors.NewBadRequest(apperrors.SlotOutsideSchedule, "startsAt does not fit owner working hours")
}

func openapiDate(t time.Time) openapi_types.Date {
	return openapi_types.Date{Time: t}
}
