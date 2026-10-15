/** Synthetic demo only. Never loaded by the app or mixed into a LIVE workspace automatically. */
import {
  OperationsStateSchema,
  type InventoryItem,
  type SalesOrder,
  type FulfillmentStatus,
  type OperationsState,
  type OperationContext,
} from "../schemas/inventoryOrderSchema";
import {
  applyOperationsCommand,
  calculateOrderLine,
  calculateOrderTotals,
} from "../services/inventoryAnalyticsEngine";
export const MOCK_REFERENCE_DATE = "2026-10-15T16:00:00.000Z";
export const MOCK_DATA_LABEL =
  "DỮ LIỆU MẪU — KHÔNG PHẢI GIAO DỊCH/HÓA ĐƠN THẬT";
const catalogue = [
  [
    "A4-80",
    "Giấy in A4 80gsm",
    "Văn phòng phẩm",
    "Thùng",
    365000,
    435000,
    85,
    4,
    15,
  ],
  [
    "POS-T2",
    "Máy tính tiền POS",
    "Thiết bị POS",
    "Bộ",
    6800000,
    8500000,
    12,
    7,
    3,
  ],
  [
    "QR-LED",
    "Loa báo chuyển khoản",
    "Thiết bị POS",
    "Cái",
    420000,
    650000,
    38,
    5,
    10,
  ],
  [
    "PRN-80",
    "Máy in hóa đơn nhiệt",
    "Thiết bị POS",
    "Cái",
    950000,
    1350000,
    15,
    5,
    5,
  ],
  [
    "SCAN-2D",
    "Máy quét mã vạch",
    "Thiết bị POS",
    "Cái",
    1450000,
    1950000,
    25,
    6,
    4,
  ],
  [
    "LABEL-40",
    "Máy in tem nhãn",
    "Thiết bị POS",
    "Cái",
    900000,
    1600000,
    50,
    3,
    10,
  ],
  [
    "BILL-80",
    "Giấy in nhiệt 80mm",
    "Văn phòng phẩm",
    "Thùng",
    520000,
    680000,
    32,
    3,
    8,
  ],
  ["INK-BK", "Mực in đen", "Văn phòng phẩm", "Hộp", 180000, 250000, 15, 4, 4],
  ["DRAWER", "Ngăn kéo thu ngân", "Phụ kiện", "Cái", 620000, 890000, 42, 5, 5],
  [
    "COUNT-UV",
    "Máy đếm tiền UV",
    "Phụ kiện",
    "Máy",
    4100000,
    5200000,
    11,
    7,
    2,
  ],
] as const;
export function createMockOperationsState(): OperationsState {
  const createdAt = "2026-08-01T08:00:00.000Z";
  let state: OperationsState = {
    schemaVersion: "1.0.0",
    datasetKind: "SAMPLE",
    inventory: catalogue.map((row, index): InventoryItem => ({
      id: `sku-${index + 1}`,
      sku: row[0],
      name: row[1],
      category: row[2],
      unit: row[3],
      costPrice: 0,
      sellingPrice: row[5],
      taxRate: 8,
      onHandQty: 0,
      reservedQty: 0,
      availableQty: 0,
      leadTimeDays: row[7],
      safetyStockQty: row[8],
      supplierName: `Nhà cung cấp mẫu ${(index % 3) + 1}`,
      createdAt,
      lastSoldAt: null,
      lastRestockedAt: null,
    })),
    orders: [],
    movements: [],
    processedOperations: [],
  };
  const event = (id: string, date: string): OperationContext => ({
    operationId: id,
    actorId: "demo-operator",
    timestamp: date,
    note: MOCK_DATA_LABEL,
  });
  for (const [index, row] of catalogue.entries())
    state = applyOperationsCommand(state, {
      type: "RECEIVE_STOCK",
      skuId: `sku-${index + 1}`,
      qty: row[6],
      unitCost: row[4],
      referenceCode: `DEMO-IN-${index + 1}`,
      context: event(`seed-in-${index + 1}`, createdAt),
    }).state;
  const fixtures: {
    status: FulfillmentStatus;
    lines: [number, number, number?][];
    payment: "NONE" | "PARTIAL" | "FULL";
    invoice: boolean;
  }[] = [
    {
      status: "DELIVERED",
      lines: [
        [2, 3, 500000],
        [6, 3],
      ],
      payment: "FULL",
      invoice: true,
    },
    {
      status: "DELIVERED",
      lines: [
        [3, 20, 400000],
        [7, 12, 160000],
      ],
      payment: "FULL",
      invoice: false,
    },
    {
      status: "DELIVERED",
      lines: [
        [1, 35, 225000],
        [4, 6, 100000],
      ],
      payment: "PARTIAL",
      invoice: false,
    },
    {
      status: "DELIVERED",
      lines: [
        [5, 8],
        [8, 4],
      ],
      payment: "NONE",
      invoice: true,
    },
    {
      status: "DELIVERED",
      lines: [
        [2, 4],
        [3, 10],
        [7, 10],
      ],
      payment: "FULL",
      invoice: false,
    },
    {
      status: "DELIVERED",
      lines: [
        [1, 30],
        [6, 4],
      ],
      payment: "PARTIAL",
      invoice: false,
    },
    {
      status: "SHIPPING",
      lines: [
        [1, 8],
        [6, 4],
      ],
      payment: "FULL",
      invoice: false,
    },
    {
      status: "CONFIRMED",
      lines: [
        [2, 2],
        [3, 5],
        [4, 3],
        [7, 6],
        [1, 4],
        [5, 2],
      ],
      payment: "NONE",
      invoice: false,
    },
    { status: "DRAFT", lines: [[1, 10]], payment: "NONE", invoice: false },
    { status: "RETURNED", lines: [[9, 2]], payment: "NONE", invoice: false },
    { status: "CANCELLED", lines: [[10, 1]], payment: "NONE", invoice: false },
    { status: "SHIPPING", lines: [[8, 2]], payment: "PARTIAL", invoice: true },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    const date = `2026-10-${String(index + 2).padStart(2, "0")}T10:00:00.000Z`,
      id = `demo-order-${index + 1}`;
    const items = fixture.lines.map(([skuIndex, qty, discountAmount = 0]) => {
      const sku = state.inventory[skuIndex - 1];
      return calculateOrderLine({
        skuId: sku.id,
        skuCode: sku.sku,
        name: sku.name,
        unit: sku.unit,
        qty,
        unitPrice: sku.sellingPrice,
        costPriceAtSale: sku.costPrice,
        discountAmount,
        taxRate: sku.taxRate,
      });
    });
    const order: SalesOrder = {
      id,
      orderCode: `DEMO-ORD-${String(index + 1).padStart(3, "0")}`,
      createdAt: date,
      updatedAt: date,
      deliveredAt: null,
      customerName: `Khách hàng mẫu ${index + 1} (giả lập)`,
      customerPhone: "",
      customerTaxCode: null,
      buyerRequiresInvoice: true,
      items,
      ...calculateOrderTotals(items),
      paidAmount: 0,
      fulfillmentStatus: "DRAFT",
      paymentStatus: "UNPAID",
      invoiceStatus: "NOT_REQUIRED",
      invoiceMeta: null,
      notes: MOCK_DATA_LABEL,
    };
    state = { ...state, orders: [...state.orders, order] };
    const transition = (status: FulfillmentStatus) => {
      state = applyOperationsCommand(state, {
        type: "TRANSITION_ORDER",
        orderId: id,
        nextStatus: status,
        context: event(`${id}-${status}`, date),
      }).state;
    };
    if (fixture.status !== "DRAFT") {
      transition("CONFIRMED");
      if (fixture.status === "RETURNED") {
        transition("DELIVERED");
        transition("RETURNED");
      } else if (fixture.status !== "CONFIRMED") transition(fixture.status);
    }
    if (fixture.payment !== "NONE")
      state = applyOperationsCommand(state, {
        type: "RECORD_PAYMENT",
        orderId: id,
        paidAmount:
          fixture.payment === "FULL"
            ? order.grandTotalAmount
            : Math.floor(order.grandTotalAmount / 3),
        context: event(`${id}-payment`, date),
      }).state;
    if (fixture.invoice)
      state = applyOperationsCommand(state, {
        type: "RECORD_INVOICE",
        orderId: id,
        invoice: {
          invoiceNumber: `DEMO-${index + 1}`,
          invoiceSymbol: "DEMO-ONLY",
          issuedAt: date,
        },
        context: event(`${id}-invoice`, date),
      }).state;
  }
  return OperationsStateSchema.parse(state);
}
const seed = createMockOperationsState();
export const MOCK_INVENTORY_ITEMS = seed.inventory;
export const MOCK_SALES_ORDERS = seed.orders;
export const MOCK_STOCK_MOVEMENTS = seed.movements;
