package config

import (
	"log/slog"
	"os"

	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
)

type Config struct {
	OwnerLogin       string `envconfig:"OWNER_LOGIN" default:"admin" required:"true"`
	OwnerPassword    string `envconfig:"OWNER_PASSWORD" default:"admin" required:"true"`
	ServerAddr       string `envconfig:"SERVER_ADDR" default:":8080"`
	Port             string `envconfig:"PORT"`
	LogLevel         string `envconfig:"LOG_LEVEL" default:"info"`
	LoginMaxAttempts int    `envconfig:"LOGIN_MAX_ATTEMPTS" default:"5"`
}

func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		return nil, err
	}

	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, err
	}

	// PORT (например, его задаёт Render) имеет приоритет над SERVER_ADDR.
	if cfg.Port != "" {
		cfg.ServerAddr = ":" + cfg.Port
	}
	return &cfg, nil
}

func InitLogger(level string) *slog.Logger {
	var l slog.Level
	switch level {
	case "debug":
		l = slog.LevelDebug
	case "warn":
		l = slog.LevelWarn
	case "error":
		l = slog.LevelError
	default:
		l = slog.LevelInfo
	}
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: l})
	return slog.New(handler)
}
