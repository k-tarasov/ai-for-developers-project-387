package config

import (
	"os"
	"testing"
)

// unsetEnv убирает переменные окружения на время теста и возвращает после.
func unsetEnv(t *testing.T, keys ...string) {
	t.Helper()
	for _, k := range keys {
		old, had := os.LookupEnv(k)
		if err := os.Unsetenv(k); err != nil {
			t.Fatalf("unsetenv %s: %v", k, err)
		}
		if had {
			t.Cleanup(func() { os.Setenv(k, old) })
		}
	}
}

func TestLoadDefaultServerAddr(t *testing.T) {
	unsetEnv(t, "PORT", "SERVER_ADDR")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ServerAddr != ":8080" {
		t.Errorf("ServerAddr = %q, want %q", cfg.ServerAddr, ":8080")
	}
}

func TestLoadServerAddrFromEnv(t *testing.T) {
	unsetEnv(t, "PORT")
	t.Setenv("SERVER_ADDR", ":9000")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ServerAddr != ":9000" {
		t.Errorf("ServerAddr = %q, want %q", cfg.ServerAddr, ":9000")
	}
}

func TestLoadPortOverridesServerAddr(t *testing.T) {
	t.Setenv("PORT", "3000")
	t.Setenv("SERVER_ADDR", ":9000")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.ServerAddr != ":3000" {
		t.Errorf("ServerAddr = %q, want %q (PORT имеет приоритет)", cfg.ServerAddr, ":3000")
	}
}
