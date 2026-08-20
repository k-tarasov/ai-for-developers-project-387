import "@typespec/rest";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.OpenAPI;

/**
 * «Запись на звонок» — упрощённый сервис бронирования времени по мотивам cal.com.
 *
 * Роли:
 *  - Владелец календаря — единственный профиль, задаётся конфигурацией сервера.
 *  - Гость — бронирует слоты без регистрации.
 *  Авторизации нет: админские и гостевые эндпоинты открыты (MVP).
 *
 * Правила занятости и окна записи:
 *  - Окно записи: 14 дней, начиная с сегодняшней даты (UTC).
 *  - Сетка слотов: 15 минут — начало брони должно быть кратно 15 минутам.
 *  - Слот имеет длину `durationMinutes` выбранного типа события и должен целиком
 *    помещаться в рабочие часы этого дня.
 *  - Рабочие часы: расписание владельца по умолчанию (PUT /schedule) либо
 *    собственное расписание типа события (`availability`), если задано — оно в приоритете.
 *  - Пересечение броней запрещено: на одно время нельзя создать две записи,
 *    даже для разных типов событий.
 *  - Все даты и время передаются в ISO 8601 в UTC. Рабочие часы интерпретируются в UTC.
 */
@service(#{ title: "Запись на звонок" })
@server("http://localhost:8080/api", "Сервер разработки")
namespace BookingApi;

// ---------------------------------------------------------------------------
// Модели
// ---------------------------------------------------------------------------

/** Интервал рабочего времени внутри дня, например 09:00–13:00. */
model TimeInterval {
  /** Начало интервала, формат HH:mm. */
  start: plainTime;
  /** Конец интервала, формат HH:mm. Должен быть больше начала. */
  end: plainTime;
}

/** Недельное расписание. Пустой массив интервалов — день недоступен. */
model WeeklySchedule {
  /** Понедельник. */
  mon: TimeInterval[];
  /** Вторник. */
  tue: TimeInterval[];
  /** Среда. */
  wed: TimeInterval[];
  /** Четверг. */
  thu: TimeInterval[];
  /** Пятница. */
  fri: TimeInterval[];
  /** Суббота. */
  sat: TimeInterval[];
  /** Воскресенье. */
  sun: TimeInterval[];
}

/** Тип события — вид брони, который публикует владелец календаря. */
model EventType {
  /** Уникальный идентификатор (slug), задаётся владельцем при создании. Пример: "intro-call". */
  @pattern("^[a-z0-9]+(-[a-z0-9]+)*$")
  @maxLength(63)
  @key("eventTypeId")
  id: string;

  /** Название, отображается гостю. Пример: "Знакомственный звонок". */
  title: string;

  /** Описание для страницы выбора вида брони. */
  description: string;

  /** Длительность встречи в минутах, кратна сетке слотов (15 минут). */
  @minValue(15)
  @maxValue(180)
  durationMinutes: int32;

  /**
   * Собственное расписание доступности. Если не задано — используется
   * расписание владельца по умолчанию (GET/PUT /schedule).
   */
  availability?: WeeklySchedule;
}

/** Свободный слот длиной в длительность типа события. */
model Slot {
  startsAt: utcDateTime;
  endsAt: utcDateTime;
}

/** Ответ со свободными слотами на окно записи. */
model SlotsResponse {
  /** Первый день окна записи — сегодня (UTC). */
  windowStartsOn: plainDate;
  /** Последний день окна записи (14 дней, включая сегодняшний). */
  windowEndsOn: plainDate;
  /** Свободные слоты по возрастанию startsAt. */
  slots: Slot[];
}

/** Данные для создания бронирования. */
model BookingCreate {
  /** id (slug) выбранного типа события. */
  eventTypeId: string;

  /** Начало слота, ISO 8601 UTC. Кратно 15 минутам и внутри окна записи. */
  startsAt: utcDateTime;

  guestName: string;

  /** Телефон гостя. Обязателен хотя бы один контакт: guestPhone или guestEmail. */
  guestPhone?: string;

  /** Email гостя. Обязателен хотя бы один контакт: guestPhone или guestEmail. */
  @format("email")
  guestEmail?: string;

  guestComment?: string;
}

/** Снимок типа события на момент бронирования. Хранится даже после удаления типа. */
model BookingEventType {
  id: string;
  title: string;
  durationMinutes: int32;
}

/** Бронирование. */
model Booking {
  @format("uuid")
  id: string;

  eventType: BookingEventType;

  startsAt: utcDateTime;
  endsAt: utcDateTime;

  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  guestComment?: string;

  createdAt: utcDateTime;
}

/** Данные для входа владельца. */
model OwnerLogin {
  /** Логин владельца, задан статически при старте сервера. */
  login: string;

  /** Пароль владельца, задан статически при старте сервера. */
  password: string;
}

/** Успешный вход: сессия выдаётся через httpOnly cookie `owner_session`. */
model AuthSuccess {
  ok: true;
}

/** Профиль гостя, идентифицируемый по httpOnly cookie `guest_id`. */
model GuestProfile {
  /** Идентификатор гостя (совпадает с cookie `guest_id`). */
  id: string;

  /** Имя гостя. */
  name: string;

  /** Телефон гостя. */
  guestPhone?: string;

  /** Email гостя. */
  @format("email")
  guestEmail?: string;
}

/** Данные для создания/идентификации гостя. */
model GuestCreate {
  /** Имя гостя. */
  name: string;

  /** Телефон гостя. */
  guestPhone?: string;

  /** Email гостя. */
  @format("email")
  guestEmail?: string;

  /** Запомнить гостя на 30 дней (cookie `guest_id` со сроком 30 дней). */
  rememberMe: boolean;
}

// ---------------------------------------------------------------------------
// Ошибки
// ---------------------------------------------------------------------------

@error
model BadRequestError {
  @statusCode
  _: 400;
  code:
    | "VALIDATION_ERROR"
    | "CONTACT_REQUIRED"
    | "SLOT_MISALIGNED"
    | "SLOT_OUT_OF_WINDOW"
    | "SLOT_OUTSIDE_SCHEDULE";
  message: string;
}

@error
model NotFoundError {
  @statusCode
  _: 404;
  code: "EVENT_TYPE_NOT_FOUND";
  message: string;
}

@error
model ConflictError {
  @statusCode
  _: 409;
  code: "DUPLICATE_EVENT_TYPE_ID" | "SLOT_BUSY";
  message: string;
}

@error
model UnauthorizedError {
  @statusCode
  _: 401;
  code: "INVALID_CREDENTIALS" | "NO_OWNER_SESSION";
  message: string;
}

@error
model LoginThrottledError {
  @statusCode
  _: 429;
  code: "LOGIN_ATTEMPTS_EXCEEDED";
  message: string;
}

@error
model GuestUnknownError {
  @statusCode
  _: 404;
  code: "GUEST_UNKNOWN";
  message: string;
}

// ---------------------------------------------------------------------------
// Типы событий
// ---------------------------------------------------------------------------

@route("/event-types")
interface EventTypes {
  /** Список всех типов событий. Используется гостем и владельцем. */
  @get
  list(): EventType[];

  /** Получить тип события по id. */
  @route("/{eventTypeId}")
  @get
  get(@path eventTypeId: string): EventType | NotFoundError;

  /** Создать тип события. id (slug) задаёт владелец, дубликат → 409. */
  @post
  create( @body body: EventType): {
    @statusCode
    _: 201;
    @body
    eventType: EventType;
  } | BadRequestError | ConflictError | UnauthorizedError;

  /** Обновить тип события. Поле id в теле игнорируется. */
  @route("/{eventTypeId}")
  @put
  update(
  
    @path eventTypeId: string,
    @body body: EventType,
  ): EventType | BadRequestError | NotFoundError | UnauthorizedError;

  /**
   * Удалить тип события. Существующие брони этого типа сохраняются,
   * новые — создать нельзя (404).
   */
  @route("/{eventTypeId}")
  @delete
  delete( @path eventTypeId: string): {
    @statusCode
    _: 204;
  } | NotFoundError | UnauthorizedError;

  /**
   * Свободные слоты типа события на окно записи (14 дней).
   * Слот предлагается, если событие целиком помещается в рабочие часы дня
   * и не пересекается с существующими бронями.
   */
  @route("/{eventTypeId}/slots")
  @get
  listSlots(@path eventTypeId: string): SlotsResponse | NotFoundError;
}

// ---------------------------------------------------------------------------
// Расписание владельца по умолчанию
// ---------------------------------------------------------------------------

@route("/schedule")
interface Schedule {
  /** Текущее расписание владельца по умолчанию. */
  @get
  get(): WeeklySchedule | UnauthorizedError;

  /** Полностью заменить расписание владельца по умолчанию. */
  @put
  update(
  
    @body body: WeeklySchedule,
  ): WeeklySchedule | BadRequestError | UnauthorizedError;
}

// ---------------------------------------------------------------------------
// Бронирования
// ---------------------------------------------------------------------------

@route("/bookings")
interface Bookings {
  /**
   * Создать бронирование (гость). Начало должно быть кратно 15 минутам,
   * попадать в окно 14 дней и в свободный слот.
   */
  @post
  create(@body body: BookingCreate): {
    @statusCode
    _: 201;
    @body
    booking: Booking;
  } | BadRequestError | NotFoundError | ConflictError;

  /** Предстоящие брони всех типов событий (startsAt >= сейчас), по возрастанию startsAt. */
  @get
  list(): Booking[] | UnauthorizedError;
}

// ---------------------------------------------------------------------------
// Аутентификация владельца
// ---------------------------------------------------------------------------

/** Сессия владельца выдаётся в httpOnly cookie `owner_session`. */
model OwnerSessionCookie {
  @header("Set-Cookie")
  "set-cookie": string;
}

@route("/auth")
interface Auth {
  /**
   * Вход владельца по логину и паролю. При успехе устанавливает httpOnly cookie
   * `owner_session`. При неверных данных — 401 `INVALID_CREDENTIALS`.
   * При превышении лимита неудачных попыток — 429 `LOGIN_ATTEMPTS_EXCEEDED`.
   */
  @post
  @route("/login")
  login(@body body: OwnerLogin):
    | (AuthSuccess & OwnerSessionCookie & { @statusCode _: 200 })
    | UnauthorizedError
    | LoginThrottledError;
}

// ---------------------------------------------------------------------------
// Профиль гостя
// ---------------------------------------------------------------------------

/** Идентификация гостя происходит по httpOnly cookie `guest_id`. */
model GuestIdCookie {
  @header("Set-Cookie")
  "set-cookie": string;
}

@route("/guest")
interface Guest {
  /**
   * Профиль гостя по известной cookie `guest_id`. Без cookie или с неизвестной
   * cookie — 404 `GUEST_UNKNOWN`.
   */
  @get
  get(): GuestProfile | GuestUnknownError;

  /**
   * Создать/идентифицировать гостя. При `rememberMe=true` cookie `guest_id`
   * выдаётся со сроком 30 дней, иначе — сессионная. Без контакта — 400.
   */
  @post
  create(@body body: GuestCreate):
    | (GuestProfile & GuestIdCookie & { @statusCode _: 201 })
    | BadRequestError
    | GuestUnknownError;

  /**
   * Обновить профиль знакомого гостя. Без валидной cookie `guest_id` — 404
   * `GUEST_UNKNOWN`.
   */
  @put
  update( @body body: GuestProfile):
    GuestProfile
    | BadRequestError
    | GuestUnknownError;
}
