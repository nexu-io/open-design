import platform
import os
import subprocess
import shutil
import ctypes


def run(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT, text=True).strip()
    except Exception:
        return "missing"


os_name = platform.system()
caption = platform.platform()
cpu_count = os.cpu_count()
cpu_info = "unknown"
if os_name == "Windows":
    cpu_info = run("wmic cpu get Name,NumberOfCores,NumberOfLogicalProcessors /format:list")
else:
    cpu_info = run("lscpu | grep 'Model name'")

mem_total = None
mem_free = None
if os_name == "Windows":
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_uint32),
            ("dwMemoryLoad", ctypes.c_uint32),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    mem = MEMORYSTATUSEX()
    mem.dwLength = ctypes.sizeof(mem)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem))
    mem_total = mem.ullTotalPhys
    mem_free = mem.ullAvailPhys
else:
    try:
        import psutil
        v = psutil.virtual_memory()
        mem_total = v.total
        mem_free = v.available
    except Exception:
        pass

try:
    du = shutil.disk_usage("C:/")
    disk_total = du.total
    disk_free = du.free
except Exception:
    disk_total = None
    disk_free = None

gpu_info = run("wmic path win32_videocontroller get Name,AdapterRAM,DriverVersion,Status /format:list")
python_ver = run("python --version")
node_ver = run("node --version")
docker_ver = run("docker version --format '{{.Server.Version}}'")
git_ver = run("git --version")

print("OS:", caption)
print("CPU count:", cpu_count)
print("CPU info:", cpu_info)
print("Memory total GB:", round(mem_total / 1024**3, 2) if mem_total else "unknown")
print("Memory free GB:", round(mem_free / 1024**3, 2) if mem_free else "unknown")
print("Disk total GB:", round(disk_total / 1024**3, 2) if disk_total else "unknown")
print("Disk free GB:", round(disk_free / 1024**3, 2) if disk_free else "unknown")
print("GPU info:")
print(gpu_info)
print("Python:", python_ver)
print("Node:", node_ver)
print("Docker:", docker_ver)
print("Git:", git_ver)
