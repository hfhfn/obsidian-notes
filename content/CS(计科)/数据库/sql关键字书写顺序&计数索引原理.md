---
created: '2026-08-05T10:08:10+08:00'
modified: '2026-08-05T10:08:10+08:00'
---

> [!question] 我的问题
> 说明sql语句中, 各种关键字的书写顺序

---

SQL语句的**书写顺序**和**执行顺序**是不同的，这是一个非常重要的概念。

## 一、SQL语句的书写顺序```sql
SELECT DISTINCT 列名           -- 1. 选择列
FROM 表名                     -- 2. 来源表
JOIN 另一张表 ON 连接条件      -- 3. 连接其他表
WHERE 行级过滤条件            -- 4. 行级过滤
GROUP BY 分组列              -- 5. 分组
HAVING 组级过滤条件          -- 6. 组级过滤
ORDER BY 排序列              -- 7. 排序
LIMIT 限制行数               -- 8. 限制条数
```

## 二、完整的书写顺序示例```sql
SELECT 
    c.category_name,
    COUNT(p.product_id) AS product_count,
    AVG(p.price) AS avg_price
FROM 
    products p
    INNER JOIN categories c ON p.category_id = c.category_id
WHERE 
    p.status = 'active'
    AND p.price > 100
GROUP BY 
    c.category_name
HAVING 
    COUNT(p.product_id) >= 10
ORDER BY 
    product_count DESC,
    c.category_name ASC
LIMIT 5;
```

## 三、各个关键字的含义和作用

| 关键字 | 作用 | 必填 |
| --- | --- | --- |
| **SELECT** | 指定要查询的列 | ✅ 必须 |
| **FROM** | 指定数据来源表 | ✅ 必须 |
| **JOIN** | 关联其他表 | ❌ 可选 |
| **WHERE** | 过滤行数据 | ❌ 可选 |
| **GROUP BY** | 分组统计 | ❌ 可选 |
| **HAVING** | 过滤分组后的数据 | ❌ 可选 |
| **ORDER BY** | 排序 | ❌ 可选 |
| **LIMIT** | 限制返回行数 | ❌ 可选 |

## 四、各数据库的差异

**MySQL/PostgreSQL/SQLite:**```sql
-- LIMIT 放在最后
SELECT * FROM users LIMIT 10;
```

**SQL Server/T-SQL:**```sql
-- 使用 TOP
SELECT TOP 10 * FROM users;

-- 或使用 OFFSET/FETCH
SELECT * FROM users 
ORDER BY id 
OFFSET 0 ROWS 
FETCH NEXT 10 ROWS ONLY;
```

**Oracle:**```sql
-- 使用 ROWNUM
SELECT * FROM users WHERE ROWNUM <= 10;

-- 或使用 OFFSET/FETCH (12c+)
SELECT * FROM users 
OFFSET 0 ROWS 
FETCH NEXT 10 ROWS ONLY;
```

## 五、常见错误写法

❌ **错误：WHERE 中使用聚合函数**```sql
SELECT * FROM products 
WHERE AVG(price) > 100;  -- 聚合函数不能在WHERE中
```

✅ **正确：聚合函数在HAVING中**```sql
SELECT category_id, AVG(price) 
FROM products 
GROUP BY category_id 
HAVING AVG(price) > 100;
```

❌ **错误：ORDER BY 位置不对**```sql
SELECT * FROM products 
LIMIT 10 
ORDER BY price;  -- ORDER BY 应该在 LIMIT 之前
```

✅ **正确：ORDER BY 在 LIMIT 之前**```sql
SELECT * FROM products 
ORDER BY price 
LIMIT 10;
```

## 六、快速记忆口诀

> **SELECT FROM JOIN**  
> **WHERE GROUP HAVING**  
> **ORDER BY 再 LIMIT**  
> **顺序千万不能错**

这个顺序是SQL的标准写法，遵循这个规则可以避免大部分语法错误。

count(*)和count(id)和count(1)在mysql8中的性能有区别吗

**在MySQL 8 + InnoDB环境下，`COUNT(*)` 和 `COUNT(1)` 性能完全没有区别，两者都是效率最高的写法；`COUNT(id)` 性能略低；`COUNT(字段)` 性能最差（尤其是非索引字段）。**

这是一个流传甚广但已在MySQL 5.7/8.0版本中被证伪的技术误区。下面我用实测数据和原理拆解来为你澄清：

### 🔍 核心结论：性能排名与实测数据

根据在**MySQL 5.7.23/8.0**环境下、**1100万+数据量**的多次实测，结论高度一致[-3](https://blog.csdn.net/weixin_38923162/article/details/123293386)[-6](https://m.elecfans.com/article/1948747.html)[-7](https://cloud.tencent.cn/developer/article/2178200)：

**`COUNT(*)` ≈ `COUNT(1)` > `COUNT(主键id)` > `COUNT(索引字段)` > `COUNT(非索引字段)`**

| 写法 | 执行时间 (1100万行) | 执行计划特点 | 关键行为 |
| --- | --- | --- | --- |
| **`COUNT(*)`** | **3.11秒** | 走**最小二级索引** | **不取值**，优化器专门优化，直接累加 |
| **`COUNT(1)`** | **3.04秒** | 走**最小二级索引** | **不取值**，server层每行放1，累加 |
| `COUNT(主键id)` | 16.07秒 | 强制走主键/二级索引 | **需取值**，涉及解析数据行、拷贝字段值 |
| `COUNT(索引字段)` | 6.63秒 | 走该字段索引 | 需取值、判断NULL |
| `COUNT(非索引字段)` | 16.85秒 | **全表扫描** | 最慢，需读数据页+判断NULL |

**关键发现**：`COUNT(*)`和`COUNT(1)`实测都在**3秒**左右，而`COUNT(主键id)`超过**16秒**——差了5倍以上[-3](https://blog.csdn.net/weixin_38923162/article/details/123293386)。

### ⚙️ 为什么性能有差异？原理拆解（InnoDB）

**1. `COUNT(*)` 与 `COUNT(1)`：优化器“一视同仁”**

* MySQL 8.0官方文档明确指出：**“InnoDB handles SELECT COUNT(*) and SELECT COUNT(1) operations in the same way. There is no performance difference.”**[-5](https://cloud.tencent.com.cn/developer/article/2415917?from=15425)
* 两者都不从引擎层“取值”：`COUNT(*)`被优化为`COUNT(0)`，`COUNT(1)`直接传常数，server层每行+1即可[-5](https://cloud.tencent.com.cn/developer/article/2415917?from=15425)[-7](https://cloud.tencent.cn/developer/article/2178200)
* **优化器策略**：自动选择**key_len最小**的二级索引遍历，而非主键（因为二级索引叶子节点只存主键值，比聚簇索引小得多）[-3](https://blog.csdn.net/weixin_38923162/article/details/123293386)[-5](https://cloud.tencent.com.cn/developer/article/2415917?from=15425)

**2. `COUNT(主键id)`：慢在“取值”**

* 必须从引擎层读取每一行的**id字段值**并返回给server层，涉及**解析数据行、拷贝字段值**的操作[-1](https://cloud.tencent.cn/developer/information/%E7%AC%AC%E4%BA%8C%E4%B8%AA%E8%A1%A8%E4%B8%AD%E7%9A%84Count%E5%AD%97%E6%AE%B5)[-7](https://cloud.tencent.cn/developer/article/2178200)
* 即使走索引，这部分额外开销在大数据量下非常明显

**3. `COUNT(字段)`：最慢的两个坑**

* **非索引字段**：只能**全表扫描**，没有索引可用[-3](https://blog.csdn.net/weixin_38923162/article/details/123293386)[-6](https://m.elecfans.com/article/1948747.html)
* **所有字段**：都需要**判断是否为NULL**（即使字段是NOT NULL，逻辑判断步骤也存在），而`COUNT(*)`和`COUNT(1)`完全跳过NULL判断[-1](https://cloud.tencent.cn/developer/information/%E7%AC%AC%E4%BA%8C%E4%B8%AA%E8%A1%A8%E4%B8%AD%E7%9A%84Count%E5%AD%97%E6%AE%B5)[-4](https://m.yisu.com/zixun/600747.html)

### 💎 最佳实践建议（针对MySQL 8.0）

1. **无脑用 `COUNT(*)`**  
   阿里巴巴开发规约强制：**不要使用`count(列名)`或`count(常量)`来替代`count(*)`**，`COUNT(*)`就是SQL92标准统计行数的语法，MySQL对它做了最深度的优化[-4](https://m.yisu.com/zixun/600747.html)[-5](https://cloud.tencent.com.cn/developer/article/2415917?from=15425)。
2. **一定要利用“最小二级索引”**  
   `COUNT(*)`虽然快，但依赖于**存在一个小字段的二级索引**。如果你的表**只有主键、没有其他索引**，`COUNT(*)`会走主键，大表依然慢——此时应主动建一个**尽量短的二级索引**（如`ALTER TABLE ADD INDEX idx_small (tiny_column)`）来加速`COUNT(*)`[-3](https://blog.csdn.net/weixin_38923162/article/details/123293386)[-5](https://cloud.tencent.com.cn/developer/article/2415917?from=15425)。
3. **严禁对大表用`COUNT(非索引字段)`**  
   这是全表扫描，数据量稍大就是接口性能杀手。
4. **追求极致精确计数，考虑计数表或缓存**  
   如果表行数极大（千万级以上）且实时性要求高，`COUNT(*)`无论如何都扛不住，建议用**额外计数表（事务维护）**或**Redis异步计数（允许短暂不一致）**[-5](https://cloud.tencent.com.cn/developer/article/2415917?from=15425)[-6](https://m.elecfans.com/article/1948747.html)。

tiny_column指什么; 如何做额外计数表或者redis计数

## 一、`tiny_column` 指的是什么？
`tiny_column` 是指**占用存储空间很小的字段**，用来作为**最小二级索引**加速 `COUNT(*)`。

### 具体选择建议：

| 字段类型 | 存储大小 | 示例 |
| --- | --- | --- |
| **`tinyint`** | **1字节** | `status TINYINT` |
| **`smallint`** | 2字节 | `level SMALLINT` |
| **`char(1)`** | 1字符 | `gender CHAR(1)` |
| **`date`** | 3字节 | `created_date DATE` |

### 实战示例：```sql
-- 原表：只有主键，COUNT(*)会走主键索引（较大）
CREATE TABLE orders (
    id BIGINT PRIMARY KEY,
    order_no VARCHAR(50),
    amount DECIMAL(10,2),
    created_at DATETIME
);

-- 添加一个最小二级索引加速COUNT(*)
ALTER TABLE orders ADD INDEX idx_flag (status); -- status是TINYINT类型

-- 或者专门建一个标记字段
ALTER TABLE orders ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD INDEX idx_deleted (deleted);
```

**原理**：InnoDB的二级索引叶子节点只存**索引字段+主键值**，比聚簇索引小得多，遍历更快。

---

## 二、额外计数表方案（精确计数）

### 适用场景：

* 对计数**要求绝对精确**
* 写并发不是极高
* 可以接受**事务中的额外写操作**

### 实现方式：

**1. 建表结构**```sql
CREATE TABLE order_stats (
    stat_key VARCHAR(50) PRIMARY KEY,  -- 如 'total_orders'
    count_value BIGINT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0   -- 乐观锁（可选）
);
```

**2. 事务中同时更新计数表**```sql
-- 开启事务
START TRANSACTION;

-- 插入订单
INSERT INTO orders (id, order_no, amount, status) 
VALUES (1, 'NO001', 100.00, 1);

-- 更新计数表（原子+1）
UPDATE order_stats 
SET count_value = count_value + 1,
    version = version + 1
WHERE stat_key = 'total_orders';

-- 提交事务
COMMIT;
```

**3. 查询总数**```sql
SELECT count_value FROM order_stats WHERE stat_key = 'total_orders';
```

### 多种维度的计数：```sql
-- 按状态统计
CREATE TABLE order_stats_detail (
    stat_date DATE,
    status TINYINT,
    count_value BIGINT,
    PRIMARY KEY (stat_date, status)
);

-- 更新
INSERT INTO order_stats_detail (stat_date, status, count_value)
VALUES (CURDATE(), 1, 1)
ON DUPLICATE KEY UPDATE count_value = count_value + 1;
```

---

## 三、Redis计数方案（高性能，最终一致）

### 适用场景：

* 超高并发
* **可以接受短暂不一致**
* 计数丢失可容忍（或可恢复）

### 1. 基础版：纯Redis计数

**写入时：**```
// 1. 先写数据库
orderMapper.insert(order);

// 2. 再更新Redis（允许失败）
redisTemplate.opsForValue()
    .increment("order:count:total", 1);
```

**查询时：**```
// 直接从Redis读
Long count = redisTemplate.opsForValue()
    .get("order:count:total");
```

**缺点**：Redis更新失败会导致计数不准

---

### 2. 改进版：定时同步

**方案A：binlog监听**```
// 监听MySQL binlog变化
@EventListener
public void handleOrderInsert(OrderInsertEvent event) {
    // 异步更新Redis
    stringRedisTemplate.opsForValue()
        .increment("order:count:total", 1);
}
```

**方案B：定时任务补偿**```
@Scheduled(cron = "0 0/5 * * * ?")  // 每5分钟
public void syncOrderCount() {
    // 从数据库查询真实总数
    Long realCount = orderMapper.selectCount();
    // 更新到Redis
    redisTemplate.opsForValue()
        .set("order:count:total", realCount.toString());
}
```

---

### 3. 多维统计的Redis结构```
// Hash结构：按日期统计
String key = "order:stats:2024-01-15";
redisTemplate.opsForHash()
    .increment(key, "total", 1);
redisTemplate.opsForHash()
    .increment(key, "paid", 1);

// Sorted Set：排行榜
redisTemplate.opsForZSet()
    .incrementScore("order:rank:category", "电子产品", 1);
```

---

## 四、三种方案对比

| 方案 | 精确度 | 性能 | 复杂度 | 推荐场景 |
| --- | --- | --- | --- | --- |
| **计数表** | **完全精确** | 中（事务开销） | 低 | 电商订单数、账户余额 |
| **纯Redis** | 可能丢失/不一致 | **极高** | 低 | 文章PV、点赞数 |
| **binlog同步** | 最终一致 | 高 | 高 | 大厂通用方案 |
| **定时同步** | 最终一致 | 高 | 中 | 中小项目折中方案 |

---

## 五、实战建议

### 根据数据量选择：

**百万级以下** 👉 直接用 `COUNT(*)` + 最小二级索引

**千万级** 👉 **计数表方案**（实现简单，绝对精确）

**亿级以上** 👉 **计数表 + Redis缓存**（Redis扛读流量，计数表保底）

### 示例：二级缓存架构```
-- 查询逻辑
public Long getOrderCount() {
    // 1. 读Redis缓存
    Long count = redisTemplate.opsForValue().get("order:count");
    if (count == null) {
        // 2. 缓存失效，从计数表读
        count = orderStatsMapper.getCount("total_orders");
        // 3. 写回Redis（设置过期防雪崩）
        redisTemplate.opsForValue()
            .set("order:count", count, 1, TimeUnit.HOURS);
    }
    return count;
}

-- 更新逻辑（事务内）
@Transactional
public void createOrder(Order order) {
    // 1. 写业务表
    orderMapper.insert(order);
    
    // 2. 更新计数表
    orderStatsMapper.incrementCount("total_orders", 1);
    
    // 3. 删除Redis缓存（下次查询重建）
    redisTemplate.delete("order:count");
}
```

这个方案既保证了计数的**绝对准确**（计数表事务保证），又支持**高并发查询**（Redis缓存），是生产环境最稳妥的选择。

InnoDB的二级索引叶子节点只存索引字段+主键值，比聚簇索引小得多，遍历更快。没懂这句话, 为什么占用空间小的字段索引就更快呢