---
created: '2026-08-05T10:08:10+08:00'
modified: '2026-08-05T10:08:10+08:00'
---

> [!question] 我的问题
> Viztracer工具

---

我来为你详细介绍 **VizTracer** —— 一款强大的Python代码性能分析和可视化工具。

## 📊 **VizTracer 是什么？**

VizTracer 是一个用于Python的低开销调试和分析工具，它可以**跟踪和可视化**Python程序的执行过程，生成交互式的性能分析报告。

## 🎯 **主要特性**

### 1. **低开销跟踪**

* 相比传统分析器，开销更小
* 选择性跟踪（可指定特定函数/模块）
* 支持多线程和异步代码

### 2. **丰富的数据收集**

* 函数调用关系
* 执行时间统计
* 参数和返回值（可选）
* 异常信息

### 3. **交互式可视化**

* 生成HTML报告
* 时间线视图展示调用关系
* 火焰图显示性能热点

## 🔧 **安装方法**
```bash
pip install viztracer
```

## 🚀 **基本使用方式**

### **方式1：命令行使用**
```
# 基本使用
viztracer your_script.py

# 生成报告
viztracer --output_file report.html your_script.py

# 跟踪特定函数
viztracer --include_functions my_function your_script.py
```

### **方式2：装饰器方式**
```python
from viztracer import VizTracer

@VizTracer()
def my_function():
    # 你的代码
    pass

# 或者作为上下文管理器
with VizTracer(output_file="trace.json"):
    # 被跟踪的代码块
    your_code()
```

### **方式3：编程方式**
```python
from viztracer import VizTracer

tracer = VizTracer()
tracer.start()

# 执行要分析的代码
your_function()

tracer.stop()
tracer.save("trace.html")  # 或保存为JSON
```

## 📈 **实用示例**

### **示例1：分析函数性能**
```python
from viztracer import VizTracer
import time

def process_data(n):
    result = []
    for i in range(n):
        result.append(i * i)
        time.sleep(0.001)
    return result

def main():
    data1 = process_data(100)
    data2 = process_data(200)
    return data1 + data2

if __name__ == "__main__":
    tracer = VizTracer()
    tracer.start()
    main()
    tracer.stop()
    tracer.save("performance_trace.html")
```

### **示例2：选择性跟踪**
```python
from viztracer import VizTracer

# 只跟踪特定函数
tracer = VizTracer(
    trace_python=True,
    max_stack_depth=10,
    include_files=["my_module/*"],
    exclude_files=["*/test_*"]
)

@VizTracer(enabled=True)
def critical_function():
    # 只有这个函数会被详细跟踪
    pass
```

## ⚙️ **常用配置选项**
```
tracer = VizTracer(
    output_file="trace.html",      # 输出文件
    max_stack_depth=5,             # 最大调用深度
    tracer_entries=1000000,        # 最大记录条目
    include_files=["./*"],         # 包含的文件模式
    exclude_files=["*/lib/*"],     # 排除的文件模式
    ignore_c_function=True,        # 忽略C函数
    log_function_args=True,        # 记录函数参数
    log_function_return=True,      # 记录返回值
    log_print=True,                # 记录print调用
    log_gc=True                    # 记录垃圾回收
)
```

## 📊 **报告解读**

生成的HTML报告包含：

### **1. 时间线视图**

* 横轴：时间线
* 纵轴：调用栈深度
* 不同颜色代表不同函数

### **2. 火焰图**

* 快速识别性能热点
* 函数宽度代表执行时间占比

### **3. 统计数据**

* 函数调用次数
* 总执行时间
* 平均执行时间
* 最短/最长执行时间

### **4. 调用关系图**

* 显示函数间的调用关系
* 识别瓶颈和优化点

## 🎨 **高级功能**

### **1. 远程跟踪**
```
# 启动远程服务器
viztracer --host 0.0.0.0 --port 9001 manage_server.py

# 客户端连接
from viztracer import RemoteVizTracer
tracer = RemoteVizTracer("localhost", 9001)
```

### **2. 与Jupyter集成**
```
%load_ext viztracer

%%viztracer
# 在这个cell中的代码会被跟踪
your_code_here()
```

### **3. 保存为JSON进行二次分析**
```
tracer.save("trace.json")

# 后续分析
from viztracer import VizTracer
tracer2 = VizTracer()
tracer2.load("trace.json")
tracer2.save_report("new_report.html")
```

## 🔍 **对比其他工具**

| 特性 | VizTracer | cProfile | Py-Spy | pyinstrument |
| --- | --- | --- | --- | --- |
| 可视化 | ✅ 交互式HTML | ❌ 文本 | ❌ 火焰图 | ✅ 简单文本 |
| 开销 | 低-中 | 高 | 极低 | 低 |
| 异步支持 | ✅ | ❌ | ✅ | ✅ |
| 时间线 | ✅ | ❌ | ❌ | ❌ |
| 参数跟踪 | ✅ | ❌ | ❌ | ❌ |

## 💡 **使用场景建议**

### **适用场景**

1. **性能瓶颈分析** - 找出耗时最长的函数
2. **调用关系理解** - 理解复杂代码的执行流程
3. **异步代码调试** - 分析协程和任务的执行顺序
4. **内存泄漏调查** - 结合对象生命周期分析
5. **代码优化验证** - 对比优化前后的性能差异

### **不适用场景**

* 需要极低开销的生产环境
* 只需要简单时间统计的情况
* 对C扩展函数的详细分析

## 📝 **最佳实践**

1. **针对性跟踪**：不要跟踪整个程序，只关注关键部分
2. **合理设置深度**：根据需求调整 `max_stack_depth`
3. **使用过滤**：通过 `include_files`/`exclude_files` 减少噪音
4. **多次采样**：对同一功能多次运行，获得稳定结果
5. **结合其他工具**：与 memory_profiler、line_profiler 结合使用

## 🚨 **注意事项**

1. **性能影响**：虽然开销较小，但仍有影响，不适合生产环境
2. **数据量控制**：长时间运行可能生成巨大文件
3. **隐私注意**：开启参数记录可能泄露敏感信息

## 🌰 **完整工作流示例**
```python
# performance_analysis.py
from viztracer import VizTracer
import json

def analyze_performance():
    # 1. 配置跟踪器
    tracer = VizTracer(
        output_file="trace.json",
        max_stack_depth=8,
        log_function_args=True,
        log_function_return=False
    )
    
    # 2. 开始跟踪
    tracer.start()
    
    # 3. 执行要分析的代码
    result = your_business_logic()
    
    # 4. 停止并保存
    tracer.stop()
    
    # 5. 生成报告
    tracer.save("trace.html")
    
    # 6. 可选：分析数据
    with open("trace.json", "r") as f:
        data = json.load(f)
        # 自定义分析...
    
    return result
```

VizTracer 特别适合需要**深入理解代码执行流程**和**可视化性能特征**的场景。它的交互式报告让性能分析变得直观，是优化Python代码的得力工具。