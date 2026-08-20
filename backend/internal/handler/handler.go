package handler

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"bookingapi/api"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"bookingapi/internal/config"
	errors "bookingapi/internal/errors"
	"bookingapi/internal/service"
	"bookingapi/internal/store"
)

type ctxKey int

const requestCtxKey ctxKey = iota

// RequestFromContext returns the *http.Request stored by the request-in-context middleware.
func RequestFromContext(ctx context.Context) *http.Request {
	r, _ := ctx.Value(requestCtxKey).(*http.Request)
	return r
}

// WithRequest stores the *http.Request in the context for cookie access in handlers.
func WithRequest(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), requestCtxKey, r)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

type Handler struct {
	store  *store.Store
	cfg    *config.Config
	logger Logger
}

// Logger is the minimal logging interface used by the handler.
type Logger interface {
	Error(msg string, args ...any)
	Warn(msg string, args ...any)
	Info(msg string, args ...any)
}

func New(s *store.Store, cfg *config.Config, l Logger) *Handler {
	return &Handler{store: s, cfg: cfg, logger: l}
}

func (h *Handler) logErr(msg string, err *errors.Error) {
	if err != nil {
		h.logger.Error(msg, "code", string(err.Code), "message", err.Message)
	}
}

func buildCookie(name, value string, maxAge int) string {
	if maxAge > 0 {
		return fmt.Sprintf("%s=%s; HttpOnly; Path=/; Max-Age=%d", name, value, maxAge)
	}
	return fmt.Sprintf("%s=%s; HttpOnly; Path=/", name, value)
}

func ownerSessionFromCtx(ctx context.Context) string {
	r := RequestFromContext(ctx)
	if r == nil {
		return ""
	}
	c, err := r.Cookie("owner_session")
	if err != nil {
		return ""
	}
	return c.Value
}

func guestIDFromCtx(ctx context.Context) string {
	r := RequestFromContext(ctx)
	if r == nil {
		return ""
	}
	c, err := r.Cookie("guest_id")
	if err != nil {
		return ""
	}
	return c.Value
}

func (h *Handler) requireOwner(ctx context.Context) *errors.Error {
	token := ownerSessionFromCtx(ctx)
	if token == "" || !h.store.OwnerSessionValid(token) {
		return errors.NewUnauthorized(errors.NoOwnerSession, "owner session required")
	}
	return nil
}

// --- Auth ---

func (h *Handler) AuthLogin(ctx context.Context, request api.AuthLoginRequestObject) (api.AuthLoginResponseObject, error) {
	body := request.Body
	if body.Login != h.cfg.OwnerLogin || body.Password != h.cfg.OwnerPassword {
		_, exceeded := h.store.RegisterFailedAttempt()
		if exceeded {
			h.logErr("auth login", errors.NewTooMany(errors.LoginAttemptsExceeded, "login attempts exceeded"))
			return api.AuthLogin429JSONResponse{
				Code:    api.LoginThrottledErrorCode(errors.LoginAttemptsExceeded),
				Message: "login attempts exceeded",
			}, nil
		}
		h.logErr("auth login", errors.NewUnauthorized(errors.InvalidCredentials, "invalid credentials"))
		return api.AuthLogin401JSONResponse{
			Code:    api.UnauthorizedErrorCode(errors.InvalidCredentials),
			Message: "invalid credentials",
		}, nil
	}
	h.store.ResetFailedAttempts()
	token := uuid.New().String()
	h.store.OwnerSessionCreate(token)
	cookie := buildCookie("owner_session", token, 60*60*24*7)
	return api.AuthLogin200JSONResponse{
		Body: api.AuthSuccess{Ok: api.True},
		Headers: api.AuthLogin200ResponseHeaders{
			SetCookie: cookie,
		},
	}, nil
}

// --- Bookings ---

func (h *Handler) BookingsList(ctx context.Context, request api.BookingsListRequestObject) (api.BookingsListResponseObject, error) {
	if err := h.requireOwner(ctx); err != nil {
		h.logErr("bookings list", err)
		return api.BookingsList401JSONResponse{
			Code:    api.UnauthorizedErrorCode(err.Code),
			Message: err.Message,
		}, nil
	}
	bookings := h.store.BookingsUpcoming(time.Now())
	return api.BookingsList200JSONResponse(bookings), nil
}

func (h *Handler) BookingsCreate(ctx context.Context, request api.BookingsCreateRequestObject) (api.BookingsCreateResponseObject, error) {
	body := request.Body
	et, ok := h.store.EventTypeGet(body.EventTypeId)
	if !ok {
		h.logErr("booking create", errors.NewNotFound(errors.EventTypeNotFound, "event type not found"))
		return api.BookingsCreate404JSONResponse{
			Code:    api.NotFoundErrorCode(errors.EventTypeNotFound),
			Message: "event type not found",
		}, nil
	}
	if body.GuestPhone == nil && body.GuestEmail == nil {
		h.logErr("booking create", errors.NewBadRequest(errors.ContactRequired, "guest phone or email required"))
		return api.BookingsCreate400JSONResponse{
			Code:    api.BadRequestErrorCode(errors.ContactRequired),
			Message: "guest phone or email required",
		}, nil
	}
	startsAt := body.StartsAt.UTC()
	windowStart := service.WindowStart(time.Now())
	if err := service.ValidateAlignmentAndWindow(startsAt, windowStart); err != nil {
		h.logErr("booking create", err)
		return api.BookingsCreate400JSONResponse{
			Code:    api.BadRequestErrorCode(err.Code),
			Message: err.Message,
		}, nil
	}
	var sched api.WeeklySchedule
	if et.Availability != nil {
		sched = *et.Availability
	} else {
		sched = h.store.ScheduleGet()
	}
	dur := time.Duration(et.DurationMinutes) * time.Minute
	if err := service.IsWithinSchedule(et, sched, startsAt, dur); err != nil {
		h.logErr("booking create", err)
		return api.BookingsCreate400JSONResponse{
			Code:    api.BadRequestErrorCode(err.Code),
			Message: err.Message,
		}, nil
	}
	now := time.Now().UTC()
	var ge *string
	if body.GuestEmail != nil {
		s := string(*body.GuestEmail)
		ge = &s
	}
	b := api.Booking{
		Id:           openapi_types.UUID(uuid.New()),
		EventType:    api.BookingEventType{Id: et.Id, Title: et.Title, DurationMinutes: et.DurationMinutes},
		StartsAt:     startsAt,
		EndsAt:       startsAt.Add(dur),
		GuestName:    body.GuestName,
		GuestPhone:   body.GuestPhone,
		GuestEmail:   ge,
		GuestComment: body.GuestComment,
		CreatedAt:    now,
	}
	if err := h.store.CreateBooking(b); err != nil {
		h.logErr("booking create", err)
		return api.BookingsCreate409JSONResponse{
			Code:    api.ConflictErrorCode(errors.SlotBusy),
			Message: err.Message,
		}, nil
	}
	return api.BookingsCreate201JSONResponse(b), nil
}

// --- Event types ---

func (h *Handler) EventTypesList(ctx context.Context, request api.EventTypesListRequestObject) (api.EventTypesListResponseObject, error) {
	return api.EventTypesList200JSONResponse(h.store.EventTypesList()), nil
}

func (h *Handler) EventTypesGet(ctx context.Context, request api.EventTypesGetRequestObject) (api.EventTypesGetResponseObject, error) {
	et, ok := h.store.EventTypeGet(request.EventTypeId)
	if !ok {
		h.logErr("event type get", errors.NewNotFound(errors.EventTypeNotFound, "event type not found"))
		return api.EventTypesGet404JSONResponse{
			Code:    api.NotFoundErrorCode(errors.EventTypeNotFound),
			Message: "event type not found",
		}, nil
	}
	return api.EventTypesGet200JSONResponse(et), nil
}

func (h *Handler) EventTypesCreate(ctx context.Context, request api.EventTypesCreateRequestObject) (api.EventTypesCreateResponseObject, error) {
	if err := h.requireOwner(ctx); err != nil {
		h.logErr("event type create", err)
		return api.EventTypesCreate401JSONResponse{
			Code:    api.UnauthorizedErrorCode(err.Code),
			Message: err.Message,
		}, nil
	}
	body := request.Body
	if !slugPattern.MatchString(body.Id) || len(body.Id) > 63 {
		h.logErr("event type create", errors.NewBadRequest(errors.ValidationError, "invalid event type id"))
		return api.EventTypesCreate400JSONResponse{
			Code:    api.BadRequestErrorCode(errors.ValidationError),
			Message: "invalid event type id",
		}, nil
	}
	if body.DurationMinutes < 15 || body.DurationMinutes > 180 || body.DurationMinutes%15 != 0 {
		h.logErr("event type create", errors.NewBadRequest(errors.ValidationError, "durationMinutes must be in [15,180] and a multiple of 15"))
		return api.EventTypesCreate400JSONResponse{
			Code:    api.BadRequestErrorCode(errors.ValidationError),
			Message: "durationMinutes must be in [15,180] and a multiple of 15",
		}, nil
	}
	if err := h.store.EventTypeCreate(*body); err != nil {
		h.logErr("event type create", err)
		return api.EventTypesCreate409JSONResponse{
			Code:    api.ConflictErrorCode(errors.DuplicateEventID),
			Message: err.Message,
		}, nil
	}
	return api.EventTypesCreate201JSONResponse(*body), nil
}

func (h *Handler) EventTypesUpdate(ctx context.Context, request api.EventTypesUpdateRequestObject) (api.EventTypesUpdateResponseObject, error) {
	if err := h.requireOwner(ctx); err != nil {
		h.logErr("event type update", err)
		return api.EventTypesUpdate401JSONResponse{
			Code:    api.UnauthorizedErrorCode(err.Code),
			Message: err.Message,
		}, nil
	}
	body := request.Body
	body.Id = request.EventTypeId
	et, ok := h.store.EventTypeUpdate(request.EventTypeId, *body)
	if !ok {
		h.logErr("event type update", errors.NewNotFound(errors.EventTypeNotFound, "event type not found"))
		return api.EventTypesUpdate404JSONResponse{
			Code:    api.NotFoundErrorCode(errors.EventTypeNotFound),
			Message: "event type not found",
		}, nil
	}
	return api.EventTypesUpdate200JSONResponse(et), nil
}

func (h *Handler) EventTypesDelete(ctx context.Context, request api.EventTypesDeleteRequestObject) (api.EventTypesDeleteResponseObject, error) {
	if err := h.requireOwner(ctx); err != nil {
		h.logErr("event type delete", err)
		return api.EventTypesDelete401JSONResponse{
			Code:    api.UnauthorizedErrorCode(err.Code),
			Message: err.Message,
		}, nil
	}
	if !h.store.EventTypeDelete(request.EventTypeId) {
		h.logErr("event type delete", errors.NewNotFound(errors.EventTypeNotFound, "event type not found"))
		return api.EventTypesDelete404JSONResponse{
			Code:    api.NotFoundErrorCode(errors.EventTypeNotFound),
			Message: "event type not found",
		}, nil
	}
	return api.EventTypesDelete204Response{}, nil
}

func (h *Handler) EventTypesListSlots(ctx context.Context, request api.EventTypesListSlotsRequestObject) (api.EventTypesListSlotsResponseObject, error) {
	et, ok := h.store.EventTypeGet(request.EventTypeId)
	if !ok {
		h.logErr("event type slots", errors.NewNotFound(errors.EventTypeNotFound, "event type not found"))
		return api.EventTypesListSlots404JSONResponse{
			Code:    api.NotFoundErrorCode(errors.EventTypeNotFound),
			Message: "event type not found",
		}, nil
	}
	var sched api.WeeklySchedule
	if et.Availability != nil {
		sched = *et.Availability
	} else {
		sched = h.store.ScheduleGet()
	}
	resp := service.ComputeSlots(et, sched, h.store.BookingsAll(), time.Now())
	return api.EventTypesListSlots200JSONResponse(resp), nil
}

// --- Schedule ---

func (h *Handler) ScheduleGet(ctx context.Context, request api.ScheduleGetRequestObject) (api.ScheduleGetResponseObject, error) {
	if err := h.requireOwner(ctx); err != nil {
		h.logErr("schedule get", err)
		return api.ScheduleGet401JSONResponse{
			Code:    api.UnauthorizedErrorCode(err.Code),
			Message: err.Message,
		}, nil
	}
	return api.ScheduleGet200JSONResponse(h.store.ScheduleGet()), nil
}

func (h *Handler) ScheduleUpdate(ctx context.Context, request api.ScheduleUpdateRequestObject) (api.ScheduleUpdateResponseObject, error) {
	if err := h.requireOwner(ctx); err != nil {
		h.logErr("schedule update", err)
		return api.ScheduleUpdate401JSONResponse{
			Code:    api.UnauthorizedErrorCode(err.Code),
			Message: err.Message,
		}, nil
	}
	body := request.Body
	if !validSchedule(*body) {
		h.logErr("schedule update", errors.NewBadRequest(errors.ValidationError, "invalid schedule intervals"))
		return api.ScheduleUpdate400JSONResponse{
			Code:    api.BadRequestErrorCode(errors.ValidationError),
			Message: "invalid schedule intervals",
		}, nil
	}
	h.store.ScheduleUpdate(*body)
	return api.ScheduleUpdate200JSONResponse(*body), nil
}

// --- Guest ---

func (h *Handler) GuestGet(ctx context.Context, request api.GuestGetRequestObject) (api.GuestGetResponseObject, error) {
	id := guestIDFromCtx(ctx)
	if id == "" {
		h.logErr("guest get", errors.NewNotFound(errors.GuestUnknown, "guest unknown"))
		return api.GuestGet404JSONResponse{
			Code:    api.GuestUnknownErrorCode(errors.GuestUnknown),
			Message: "guest unknown",
		}, nil
	}
	gp, ok := h.store.GuestGet(id)
	if !ok {
		h.logErr("guest get", errors.NewNotFound(errors.GuestUnknown, "guest unknown"))
		return api.GuestGet404JSONResponse{
			Code:    api.GuestUnknownErrorCode(errors.GuestUnknown),
			Message: "guest unknown",
		}, nil
	}
	return api.GuestGet200JSONResponse(gp), nil
}

func (h *Handler) GuestCreate(ctx context.Context, request api.GuestCreateRequestObject) (api.GuestCreateResponseObject, error) {
	body := request.Body
	if body.GuestPhone == nil && body.GuestEmail == nil {
		h.logErr("guest create", errors.NewBadRequest(errors.ContactRequired, "guest phone or email required"))
		return api.GuestCreate400JSONResponse{
			Code:    api.BadRequestErrorCode(errors.ContactRequired),
			Message: "guest phone or email required",
		}, nil
	}
	id := uuid.New().String()
	gp := api.GuestProfile{
		Id:         id,
		Name:       body.Name,
		GuestPhone: body.GuestPhone,
		GuestEmail: body.GuestEmail,
	}
	h.store.GuestCreate(gp)
	maxAge := 0
	if body.RememberMe {
		maxAge = 60 * 60 * 24 * 30
	}
	cookie := buildCookie("guest_id", id, maxAge)
	return api.GuestCreate201JSONResponse{
		Body: gp,
		Headers: api.GuestCreate201ResponseHeaders{
			SetCookie: cookie,
		},
	}, nil
}

func (h *Handler) GuestUpdate(ctx context.Context, request api.GuestUpdateRequestObject) (api.GuestUpdateResponseObject, error) {
	id := guestIDFromCtx(ctx)
	if id == "" {
		h.logErr("guest update", errors.NewNotFound(errors.GuestUnknown, "guest unknown"))
		return api.GuestUpdate404JSONResponse{
			Code:    api.GuestUnknownErrorCode(errors.GuestUnknown),
			Message: "guest unknown",
		}, nil
	}
	if _, ok := h.store.GuestGet(id); !ok {
		h.logErr("guest update", errors.NewNotFound(errors.GuestUnknown, "guest unknown"))
		return api.GuestUpdate404JSONResponse{
			Code:    api.GuestUnknownErrorCode(errors.GuestUnknown),
			Message: "guest unknown",
		}, nil
	}
	body := request.Body
	gp := api.GuestProfile{
		Id:         id,
		Name:       body.Name,
		GuestPhone: body.GuestPhone,
		GuestEmail: body.GuestEmail,
	}
	updated, _ := h.store.GuestUpdate(id, gp)
	return api.GuestUpdate200JSONResponse(updated), nil
}

func validSchedule(ws api.WeeklySchedule) bool {
	days := [][]api.TimeInterval{ws.Mon, ws.Tue, ws.Wed, ws.Thu, ws.Fri, ws.Sat, ws.Sun}
	for _, intervals := range days {
		for _, iv := range intervals {
			start, err1 := time.Parse("15:04", iv.Start)
			end, err2 := time.Parse("15:04", iv.End)
			if err1 != nil || err2 != nil {
				return false
			}
			if !end.After(start) {
				return false
			}
		}
	}
	return true
}
