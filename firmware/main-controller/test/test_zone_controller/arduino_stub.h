#pragma once
// Minimal Arduino stubs for host-side unit testing.
// Only covers what ZoneController actually uses.
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <chrono>

// millis() stub — returns real elapsed ms on the host
inline unsigned long millis() {
    using namespace std::chrono;
    static auto start = steady_clock::now();
    return (unsigned long)duration_cast<milliseconds>(steady_clock::now() - start).count();
}

inline void delay(unsigned long) {}

// Minimal Serial stub
struct SerialStub {
    template<typename... Args>
    void printf(const char* fmt, Args... args) { ::printf(fmt, args...); }
    void println(const char* s) { ::puts(s); }
};
static SerialStub Serial;

// Arduino String is not needed by ZoneController — omit it
#include <string>
using String = std::string;

// snprintf, strlcpy are in std — expose strlcpy for non-glibc hosts
#if defined(__APPLE__) || defined(__linux__)
#include <cstring>
#endif
