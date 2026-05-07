#pragma once
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <chrono>
#include <ctime>

inline unsigned long millis() {
    using namespace std::chrono;
    static auto start = steady_clock::now();
    return (unsigned long)duration_cast<milliseconds>(steady_clock::now() - start).count();
}
inline void delay(unsigned long) {}

struct SerialStub {
    template<typename... Args>
    void printf(const char* fmt, Args... args) { ::printf(fmt, args...); }
    void println(const char* s) { ::puts(s); }
    void print(const char*) {}
    void print(char) {}
};
static SerialStub Serial;

#include <string>
using String = std::string;

// Stub for Logger
namespace LoggerStub {
    inline void log(const char*, ...) {}
}
