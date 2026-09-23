# Dashboard API

All routes use the existing success/error envelope, Bearer authentication, and
a required X-Business-Id header. Any active business member may read them.
Money and quantities serialize as decimal strings.

| Endpoint | Query | Data |
| --- | --- | --- |
| GET /api/dashboard/summary | None | date, timezone, todaySales, todayPurchases, saleCount, purchaseCount, productCount, lowStockCount, recentTransactions |
| GET /api/dashboard/sales | from, to | from, to, timezone, total, count, days |
| GET /api/dashboard/purchases | from, to | from, to, timezone, total, count, days |
| GET /api/dashboard/low-stock | limit=20, offset=0 | Array of productId, name, sku, unit, quantity, minimumStock |
| GET /api/dashboard/top-products | from, to, limit=10 | from, to, timezone, items |

## Dates and Amounts

from/to are inclusive YYYY-MM-DD calendar dates in Asia/Kolkata. The default
range ends today and begins 29 days earlier. A range may contain at most 366
days. Internally the interval includes the start and excludes midnight after
the final day. This avoids double-counting adjacent ranges. Grouping uses the
same UTC+05:30 boundary as filtering.

Summary uses today's India date. Transaction metrics use saleDate/purchaseDate,
not record creation time, and include only COMPLETED transactions. Each daily
entry contains date, total, and count. Days without activity have total "0"
and count 0. Amounts are summed in PostgreSQL as numeric/Decimal values; no
binary floating-point money arithmetic is used.

Example success data from GET /api/dashboard/sales?from=2026-09-20&to=2026-09-20:

```json
{
  "success": true,
  "data": {
    "from": "2026-09-20",
    "to": "2026-09-20",
    "timezone": "Asia/Kolkata",
    "total": "1000",
    "count": 1,
    "days": [{ "date": "2026-09-20", "total": "1000", "count": 1 }]
  },
  "message": "Request completed successfully.",
  "timestamp": "2026-09-20T12:00:00.000Z"
}
```

## Stock and Products

productCount counts ACTIVE products. Low stock means quantity strictly below
minimumStock. A missing inventory projection reads as zero; an inactive product
is excluded. Equality with minimumStock is not low stock. The list sorts by
name, then product ID, with limit 1-100 and offset 0-100000.

Top products sort by completed sales revenue descending, then product ID for
stable ties. Each item contains productId, name, sku, unit, quantity, and revenue.
Historical sales of currently inactive products remain included. Ranking by
revenue avoids comparing quantities expressed in different units.

recentTransactions contains the latest 10 immutable inventory movements across
all dates, ordered by creation time and ID descending. Each entry includes id,
productId, type, signed quantity, balanceAfter, createdAt, note, and a product
object containing name, sku, and unit. Summary reads all metrics from a single
repeatable-read database snapshot.

## Errors and Verification

Missing business header or reversed/excessive date ranges return 400.
Malformed dates, invalid pagination, and unknown query fields return 422.
Missing/expired tokens or inactive users return 401. Inactive/missing business
membership returns 403. All queries scope data to the authorized business.

Swagger at /docs documents the five operations, authentication, header, query
constraints, and metric definitions. Tests in backend/test/sales.e2e-spec.ts
verify known totals, midnight boundaries, tenant isolation, empty responses,
low-stock semantics, stable pagination, historical rankings, and OpenAPI
registration. Unit tests cover date ranges, Decimal summation, and missing days.

The existing business/date and product/business indexes support these queries.
Aggregations run in PostgreSQL; endpoints do not load all sales or purchases
into application memory. No analytics tables or schema migration were needed.
