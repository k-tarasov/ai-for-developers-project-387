package apperrors

import "net/http"

type Code string

const (
	ValidationError       Code = "VALIDATION_ERROR"
	ContactRequired       Code = "CONTACT_REQUIRED"
	SlotMisaligned        Code = "SLOT_MISALIGNED"
	SlotOutOfWindow       Code = "SLOT_OUT_OF_WINDOW"
	SlotOutsideSchedule   Code = "SLOT_OUTSIDE_SCHEDULE"
	EventTypeNotFound     Code = "EVENT_TYPE_NOT_FOUND"
	DuplicateEventID      Code = "DUPLICATE_EVENT_TYPE_ID"
	SlotBusy              Code = "SLOT_BUSY"
	InvalidCredentials    Code = "INVALID_CREDENTIALS"
	NoOwnerSession        Code = "NO_OWNER_SESSION"
	LoginAttemptsExceeded Code = "LOGIN_ATTEMPTS_EXCEEDED"
	GuestUnknown          Code = "GUEST_UNKNOWN"
)

type Error struct {
	Code    Code
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

func New(code Code, status int, msg string) *Error {
	return &Error{Code: code, Status: status, Message: msg}
}

func NewBadRequest(code Code, msg string) *Error {
	return New(code, http.StatusBadRequest, msg)
}

func NewNotFound(code Code, msg string) *Error {
	return New(code, http.StatusNotFound, msg)
}

func NewConflict(code Code, msg string) *Error {
	return New(code, http.StatusConflict, msg)
}

func NewUnauthorized(code Code, msg string) *Error {
	return New(code, http.StatusUnauthorized, msg)
}

func NewTooMany(code Code, msg string) *Error {
	return New(code, http.StatusTooManyRequests, msg)
}
