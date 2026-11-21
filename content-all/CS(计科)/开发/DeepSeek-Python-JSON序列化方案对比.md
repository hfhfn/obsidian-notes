---
title: DeepSeek-Python-JSON序列化方案对比
tags:
- Python
- FastAPI
- Pydantic
- JSON
- 序列化
source: DeepSeek 会话
status: 已消化
created: '2026-09-14T01:04:41+08:00'
modified: '2026-09-14T01:04:41+08:00'
---

# DeepSeek-Python JSON 序列化方案对比

> [!abstract] 一句话
> 把 `datetime` / `Decimal` / 自定义对象转成 JSON 能懂的类型，有**手写回调、类继承、`jsonable_encoder`、Pydantic v2** 四套机制，本质差异在「按需回调」vs「主动全量遍历」。FastAPI 最佳实践是直接声明 `response_model`。

---

## 一、三种自定义方案的对比

| 方案 | 形式 | JSON 参数 | 触发时机 | 兜底行为 |
|---|---|---|---|---|
| `default_encoder` | 普通函数 | `default=` | 内置序列化失败后按需回调 | `return obj`（⚠️隐患） |
| `DateEncoder` | 继承 `json.JSONEncoder` | `cls=` | 同上，重写 `default` | `super().default(obj)`（✅正确） |
| `jsonable_encoder` | FastAPI 万能转换器 | — | 主动全量遍历每个字段 | 抛清晰错误 |

### `default_encoder` 的关键缺陷（`return obj`）

`json.dumps` 拿到 `default` 返回的值会**再次尝试序列化**。如果返回的还是原对象（未命中任何 `isinstance` 的自定义类），就陷入「无法序列化 → 调 default → 还是序列化不了」的死循环，最终抛模糊的 `TypeError`。而 `DateEncoder.super().default(obj)` 会直接抛出**明确的 TypeError**，告诉你哪个类型没处理，是官方推荐写法。

### 一个易忽略的坑：`datetime` 是 `date` 的子类

必须先判断 `datetime`、再判断 `date`，否则 datetime 会被 date 分支截胡、丢掉时间部分。

```python
if isinstance(obj, datetime):          # 先判 datetime
    return obj.strftime('%Y-%m-%d %H:%M:%S')
if isinstance(obj, date):              # 再判 date
    return obj.strftime('%Y-%m-%d')
```

### `Decimal` 转 float 丢精度

`float(Decimal('0.1'))` 底层是 `0.1000000000000000055...`。金融金额建议返回 `str(obj)` 或用 `Decimal` 字符串形式，避免精度问题。

---

## 二、`jsonable_encoder`：FastAPI 的卡车

它强在覆盖面广：

| 类型 | 你手写的处理 | `jsonable_encoder` |
|---|---|---|
| `datetime`/`date` | 自定义格式化 | ISO 格式字符串 |
| `Decimal` | `float(obj)`（丢精度）| 转 `int`/`float`（有优化）|
| Pydantic 模型 | 不处理会报错 | 自动转 `dict` |
| `Enum` | 不处理 | 提取 `.value` |
| `UUID`/`Path` | 不处理 | 转字符串 |
| `set`/`frozenset` | 不处理 | 转 `list` |
| SQLAlchemy 对象 | 不处理 | 有 `_sa` 字段过滤逻辑 |

**最关键区别：它不返回 JSON 字符串，而是返回 Python 标准结构**（`dict`/`list`...），只是值都变成了 JSON 能接受的类型。

**什么时候用它：**
- 把 Pydantic 模型存进数据库（MongoDB 等）：`jsonable_encoder(model)`
- 手动构造 `JSONResponse`：`JSONResponse(content=jsonable_encoder(data))`
- 只需要一个能安全 `json.dumps` 的 `dict` 时

---

## 三、Pydantic v2：不必自己写编码器

Pydantic v2 内置序列化，且策略和 FastAPI 不同：

- **`datetime`/`date`**：默认序列化成 ISO 格式字符串，无需配置。
- **`Decimal`**：默认转成**字符串**（不是 float），避免丢精度，对金融数据更安全。

想自定义（比如 Decimal 转 float、日期自定义格式），用 `@field_serializer`：

```python
from decimal import Decimal
from pydantic import BaseModel, field_serializer

class Product(BaseModel):
    price: Decimal

    @field_serializer('price')
    def serialize_price(self, value: Decimal, _info):
        return float(value)               # 注意精度丢失
        # return str(value.quantize(Decimal('0.00')))
```

> [!warning] 坑
> `@field_serializer` 只在 `model_dump()` / `model_dump_json()` 时生效。直接 `json.dumps(model)` 不会触发。应写成 `json.dumps(model.model_dump())` 或 `model.model_dump_json()`。

**全局配置**（自定义基类避免重复）：

```python
class MyBaseModel(BaseModel):
    model_config = ConfigDict(json_encoders={
        Decimal: lambda v: float(v),
        datetime: lambda v: v.strftime('%Y-%m-%d %H:%M:%S'),
    })
```

---

## 四、`model_validate`：与序列化相反方向

- **序列化**（`model_dump()`/`model_dump_json()`）：模型 → 可存储/传输格式。
- **验证/反序列化**（`model_validate()`/`model_validate_json()`）：原始数据 → 模型。

```python
raw = {"price": "19.99", "created_at": "2026-09-12"}
product = Product.model_validate(raw)   # 字符串 → Decimal / date
```

- 数据已是 JSON 字符串 → 直接用 `model_validate_json()`，比先 `json.loads` 再 `model_validate` 少一次解析开销。
- **strict 模式差异**：`model_validate_json('{"when":"2026-09-12"}')` 接受字符串（Pydantic 知道 JSON 没有 date 类型）；`model_validate({"when":"2026-09-12"})` 在 strict 下报错（必须是真 date 对象）。

---

## 五、效率真相：`json.dumps(default=...)` 是「兜底」不是「优先」

`json.dumps` 的流程正好相反——**先走默认序列化，只有默认逻辑 `TypeError` 时才调 `default`**：

| 数据 | 是否调 `default` |
|---|---|
| `str`/`int`/`float`/`bool`/`None`/`list`/`dict` | 否（C 层内置编码器直接处理）|
| `datetime`/`Decimal`/自定义类 | 是（内置失败后）|
| `default` 的返回值 | 按返回类型重新判断 |

```python
json.dumps({"name":"Alice", "age":30, "created_at":datetime.now()}, default=my_default)
# name/age 完全不触发 default，只有 created_at 触发一次
```

- **`default` 返回值不一定非是字符串**：可返回 list/float 等，`json` 会继续序列化。
- `default_encoder` 的 `return obj` 隐患也源于此：返回原对象会再次失败、再调 default，死循环。

**效率结论：**
- `json.dumps(default=...)` 对常规字段**零开销**（根本不碰 default），通常更快。
- `jsonable_encoder` **主动全量递归遍历** + 每个字段 `isinstance` 判断，更慢但更通用（实测 Pydantic 方案延迟 ~7.73ms vs msgspec 1.72ms；移除它可让响应端点快最多 2 倍）。

**两种正确调用方式对比：**

```python
clean = jsonable_encoder(data)   # 两阶段：先全量转换（出 dict）
json.dumps(clean)                #         再序列化

json.dumps(data, default=... )   # 一阶段：序列化过程中按需回调
```

---

## 六、FastAPI 最佳实践

> [!tip] 有 `response_model` 就用它，绕开上面所有问题
> 一旦声明 `response_model` 或返回类型，FastAPI **不会用 `jsonable_encoder`**（太慢），而是让 Pydantic 在 **Rust 侧直接生成 JSON 字节**返回，更安全（Decimal 变字符串不丢精度）也更快。

- **有 `response_model` 的接口**：直接 `return data`，别的什么都别管。
- **需要手动处理数据**（存库、构造特殊 Response）：用 `jsonable_encoder`，别自己写编码器。
- `name`/日期风格可完全交给 `jsonable_encoder` 或 Pydantic，手写 `DateEncoder` 是小推车，`jsonable_encoder` 是官方卡车。

---

## 相关笔记

- [[AI大模型/Agent/DeepSeek-Function-Calling返回JSON|Function Calling 机制与返回JSON]] — Function Calling 的 JSON 返回处理
- [[CS(计科)/数据库/sql关键字书写顺序&计数索引原理|sql关键字书写顺序&计数索引原理]] — SQL 侧数据处理