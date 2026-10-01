import { useEffect, useMemo, useRef, useState } from "react";
import { History, Printer, AlertTriangle, ClipboardList, FileSpreadsheet, FileText, Sheet, SlidersHorizontal, Layers } from "lucide-react";
import { StockImportDialog } from "./StockImportDialog";
import { type Product, type ProductCategory, updateProduct, fetchProducts, isKitProduct, kitBreakdownText } from "../../lib/products";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { StockCountSheetPrintDocument } from "./StockCountSheetPrintDocument";
import { StockCardPrintDocument } from "./StockCardPrintDocument";
import { TablePrintDocument } from "../../components/TablePrintDocument";
import { downloadXlsx, exportFileName } from "../../lib/tableExport";
import { stockBalanceSheet, stockCardSheet } from "../../lib/stockExport";
import { printDate } from "../../lib/printFormat";
import { fetchStockMovements, createStockMovement, stockValueOf, STOCK_MOVEMENT_KIND_LABEL_KEY, type StockMovement, type StockMovementKind } from "../../lib/stock";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { ListPageHeader, ListCard, ListToolbar, ListEmpty } from "../../components/ui/ListPage";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { FormDialog, StatCard, Tag, UnitInput } from "./inventoryUi";
import { money } from "./inventoryFormat";

// หน้าสต๊อกสินค้า — เพิ่ม 2026-08-18 เป็นโครงสร้างที่ตั้งใจให้ใช้ร่วมกันได้ในอนาคต (ไม่ใช่ของฝ่ายบัญชี
// เท่านั้น) ดูหมายเหตุใน api/_lib/collections.ts (StockMovementFields) — ตัวเลขคงเหลือ (stockQty) แก้ได้
// ทางเดียวคือผ่าน applyStockMovement() เท่านั้น ทุกการเปลี่ยนแปลงจึงมีประวัติย้อนหลังเสมอ
// 2026-09-03: มูลค่าสต๊อก (ต้นทุนถัวเฉลี่ย) · ประวัติแยก "คืนของ" และกรองตามประเภทได้ · การ์ดสต๊อกพิมพ์ได้
// ดีไซน์ใหม่ 2026-09-30: การ์ดตัวเลข 5 ใบ · ปุ่มส่งออกรวมเป็นเมนู "ส่งออก ▾" · ปรับสต๊อกเป็นกล่อง 480 แบบใหม่
// The Stock page — added 2026-08-18, deliberately shared infrastructure (see the doc comment on
// StockMovementFields in api/_lib/collections.ts). Product.stockQty only ever changes through
// applyStockMovement(), so every change is traceable in the movement log below.
export function StockPage({
  products,
  onProductsChange,
  categories,
  canAdjust,
  company,
  currentUserName,
  currentUserId,
  onOpenHistory,
}: {
  products: Product[];
  onProductsChange: (products: Product[]) => void;
  categories: ProductCategory[];
  canAdjust: boolean;
  /** โปรไฟล์บริษัท — ใช้เฉพาะหัวจดหมายบนใบนับสต๊อกที่พิมพ์ออกไปเดินนับของ */
  company: Company;
  /** ชื่อคนที่กดพิมพ์ เติมให้ในช่อง "ผู้นับ" ของใบนับ */
  currentUserName: string;
  currentUserId: string;
  /** ประวัติความเคลื่อนไหวย้ายไปอยู่หน้าของตัวเองแล้ว (2026-09-23) — ปุ่มประวัติของแถวพาไปแท็บติดตามสินค้าตัวนั้น */
  onOpenHistory: (productId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /** สินค้าที่กำลังจะพิมพ์การ์ดสต๊อก — โหลดประวัติทั้งหมด (ไม่ใช่ 200 แถวล่าสุด) แล้วค่อยสั่งพิมพ์ */
  const [cardProduct, setCardProduct] = useState<Product | null>(null);
  const [cardMovements, setCardMovements] = useState<StockMovement[] | null>(null);
  /** พิมพ์รายงานยอดคงเหลือ (ปุ่ม PDF — 2026-09-24) — แทนที่ใบนับสต๊อกใน DOM ชั่วคราวระหว่างพิมพ์ */
  const [listPrinting, setListPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();
  const { t } = useI18n();

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";

  const activeProducts = useMemo(() => products.filter((p) => !p.archived), [products]);
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = activeProducts.filter((p) =>
    !normalizedSearch || p.code.toLowerCase().includes(normalizedSearch) || p.name.toLowerCase().includes(normalizedSearch),
  );

  /**
   * ดึงยอดสินค้าใหม่ทุกครั้งที่เปิดหน้านี้ (2026-09-03b)
   *
   * `products` มาจากชุดข้อมูลที่ App โหลดตอนบูตครั้งเดียว แต่ยอดสต๊อกเปลี่ยนจาก **หน้าอื่น** ได้
   * ตลอดเวลา — สโตร์จ่ายของบนใบเบิก รับของบนใบรับสินค้า จ่ายเครื่องมือให้ทีม — พอเดินกลับมาหน้านี้
   * จึงเห็นยอดเก่าค้างอยู่จนกว่าจะรีเฟรชทั้งแอป ซึ่งอ่านแล้วเหมือนระบบไม่ได้บันทึกให้ (เจอจริงตอน
   * ไล่กดทดสอบ: รับของ 10 ชิ้นแล้วหน้านี้ยังขึ้น 0 ส่วนประวัติด้านล่างขึ้นยอดถูก — ขัดกันเองบนจอเดียว)
   *
   * `localEditsRef` กันไม่ให้ผลของรอบนี้ทับสิ่งที่ผู้ใช้เพิ่งบันทึกไป: ถ้าเน็ตช้า คำขอนี้อาจอ่านค่าจาก
   * เซิร์ฟเวอร์ *ก่อน* ที่ผู้ใช้จะกดปรับยอด/ตั้งจุดเตือน แต่ตอบกลับมา *ทีหลัง* — ถ้าเอาผลมาทับดื้อ ๆ
   * ยอดที่เพิ่งปรับจะเด้งกลับเป็นค่าเก่า ซึ่งคือบั๊กเดียวกับที่เอฟเฟกต์นี้ตั้งใจแก้
   */
  const localEditsRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const editsAtStart = localEditsRef.current;
    fetchProducts()
      .then((fresh) => { if (!cancelled && localEditsRef.current === editsAtStart) onProductsChange(fresh); })
      .catch(() => { /* ยอดเดิมที่ค้างอยู่ยังใช้ดูได้ ไม่ต้องรบกวนด้วย toast */ });
    return () => { cancelled = true; };
    // ครั้งเดียวตอน mount — ตั้งใจไม่ผูกกับ onProductsChange ที่เปลี่ยน identity ทุก render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // สินค้าชุด (2026-09-29) — ยอดของชุดคือจำนวนชุดที่เบิกได้จากชิ้นส่วน ไม่ใช่ของอีกชิ้นในคลัง จึงไม่รวมในจำนวนหน่วยทั้งหมด
  const totalUnits = activeProducts.reduce((sum, p) => sum + (isKitProduct(p) ? 0 : p.stockQty), 0);
  const totalValue = activeProducts.reduce((sum, p) => sum + stockValueOf(p), 0);
  const zeroStockCount = activeProducts.filter((p) => p.stockQty <= 0).length;
  /** ของใกล้หมด = ตั้งจุดเตือนไว้แล้ว และยอดคงเหลือถึงหรือต่ำกว่าจุดนั้น (จุดเตือน 0 = ปิดการเตือน) */
  const isLowStock = (product: Product) => (product.reorderPoint ?? 0) > 0 && product.stockQty <= (product.reorderPoint ?? 0);
  const lowStockCount = activeProducts.filter(isLowStock).length;

  /** id ของสินค้าที่กำลังบันทึกจุดเตือนอยู่ — กันกดรัวจนยิงซ้อนกัน */
  const [savingReorderId, setSavingReorderId] = useState<string | null>(null);
  const saveReorderPoint = async (product: Product, raw: string) => {
    const next = Math.max(0, Math.floor(Number(raw) || 0));
    if (next === (product.reorderPoint ?? 0)) return;
    setSavingReorderId(product.id);
    try {
      const updated = await updateProduct(product.id, { reorderPoint: next });
      localEditsRef.current += 1;
      onProductsChange(products.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("stock.toast.reorderSaveFailed"));
    } finally {
      setSavingReorderId(null);
    }
  };

  // พิมพ์ใบนับสต๊อก — พิมพ์ "ตามที่เห็นบนจอ" คือรวมผลค้นหาที่กรองอยู่ด้วย เพื่อให้นับทีละหมวด/ทีละคำค้นได้
  const printedAt = new Date().toISOString().slice(0, 10);
  // ประกอบหัวจดหมายแบบเดียวกับที่ใบเบิก/ใบส่งมอบทำ — หน้านี้ถือ Company เต็มอยู่แล้ว
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  const handleAdjustSaved = (updatedProductId: string, movement: StockMovement) => {
    // ยอดและต้นทุนเฉลี่ยใหม่มาจาก movement ที่ server ตอบกลับ — มูลค่าคงเหลือ ÷ จำนวน = ค่าเฉลี่ยหลังรับ
    localEditsRef.current += 1;
    onProductsChange(products.map((p) => (p.id === updatedProductId
      ? {
          ...p,
          stockQty: movement.balanceAfter,
          avgCost: movement.balanceAfter > 0 && movement.balanceValueAfter !== undefined ? movement.balanceValueAfter / movement.balanceAfter : p.avgCost,
          // รับเข้าพร้อมราคา = ราคาซื้อล่าสุดเปลี่ยนด้วย (2026-09-09) ไม่งั้นคอลัมน์ใหม่ค้างค่าเก่าจนรีโหลด
          ...(movement.kind === "receive" && (movement.unitCost ?? 0) > 0
            ? { lastCost: movement.unitCost, lastCostAt: movement.createdAt }
            : {}),
        }
      : p)));
    setAdjustTarget(null);
    toast.show(t("stock.toast.adjustSaved"));
  };

  /** การ์ดสต๊อก: โหลดประวัติทั้งหมดของสินค้าตัวนั้น (เก่า → ใหม่) แล้วสั่งพิมพ์เมื่อพร้อม */
  const printStockCard = async (product: Product) => {
    setCardProduct(product);
    setCardMovements(null);
    try {
      const all = await fetchStockMovements({ productId: product.id, limit: 2000 });
      setCardMovements([...all].reverse());
    } catch (err) {
      setCardProduct(null);
      toast.show(err instanceof ApiError ? err.message : t("stock.toast.loadCardFailed"));
    }
  };
  // ส่งออก (2026-09-24) — "ตามที่เห็นบนจอ" เหมือนใบนับสต๊อก: รวมผลค้นหาที่กรองอยู่
  const balanceSheet = () => stockBalanceSheet(filtered, categories, search.trim());
  const exportListXlsx = async () => {
    setExporting(true);
    try {
      await downloadXlsx(exportFileName("สต๊อกสินค้า"), [balanceSheet()]);
    } catch {
      toast.show(t("stock.export.failed"));
    } finally {
      setExporting(false);
    }
  };
  const exportCardXlsx = async (product: Product) => {
    setExporting(true);
    try {
      const all = await fetchStockMovements({ productId: product.id, limit: 2000 });
      await downloadXlsx(exportFileName(`การ์ดสต๊อก-${product.code}`), [stockCardSheet(product, [...all].reverse())]);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("stock.export.failed"));
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    if (!listPrinting) return;
    const reset = () => setListPrinting(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [listPrinting]);

  useEffect(() => {
    if (!cardProduct || cardMovements === null) return;
    const reset = () => { setCardProduct(null); setCardMovements(null); };
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [cardProduct, cardMovements]);

  const noRows = filtered.length === 0;
  // ปุ่มปรับสต๊อกมีเฉพาะผู้มีสิทธิ์ และไม่มีในแถวสินค้าชุด — ชี้ที่แถวแรกที่มีปุ่ม (ทัวร์ข้ามขั้นที่หาไม่เจอเอง)
  const firstAdjustableId = canAdjust ? filtered.find((p) => !isKitProduct(p))?.id : undefined;
  const tourSteps: TourStep[] = [
    { element: '[data-tour="stock-count-sheet"]', manual: "ch22-2", popover: { title: t("tour.stock.countSheet.title"), description: t("tour.stock.countSheet.desc"), side: "bottom" } },
    { element: '[data-tour="stock-kpis"]', manual: "ch22-1", popover: { title: t("tour.stock.kpis.title"), description: t("tour.stock.kpis.desc"), side: "bottom" } },
    { element: '[data-tour="stock-search"]', manual: "ch22-2", popover: { title: t("tour.stock.search.title"), description: t("tour.stock.search.desc"), side: "bottom" } },
    { element: '[data-tour="stock-table"]', manual: "ch22-1", popover: { title: t("tour.stock.table.title"), description: t("tour.stock.table.desc"), side: "top" } },
    { element: '[data-tour="stock-adjust"]', manual: "ch22-4", popover: { title: t("tour.stock.adjust.title"), description: t("tour.stock.adjust.desc"), side: "left" } },
  ];
  const tour = useModuleTour("stock", currentUserId, tourSteps);

  return (
    <div className="flex-1 overflow-y-auto print:p-0 print:overflow-visible">
      <div className="px-4 md:px-8 py-6 flex flex-col gap-5 print:hidden">
        <ListPageHeader
          module={t("nav.group.inventory")}
          title={t("stock.title")}
          description={t("stock.subtitle")}
          help={<TourReplayButton variant="title" onClick={tour.start} />}
          actions={(
            <>
              <button type="button" data-tour="stock-count-sheet" onClick={() => window.print()} disabled={noRows || cardProduct !== null} className={btn.secondary}>
                <Printer size={16} /> {t("stock.printCountSheet")}
              </button>
              <MoreMenu
                label={t("stock.export.menu")}
                items={[
                  { key: "excel", label: t("stock.export.excel"), icon: Sheet, disabled: noRows || exporting, onSelect: () => void exportListXlsx() },
                  { key: "pdf", label: t("stock.export.pdf"), icon: FileText, hint: t("stock.export.pdfHint"), disabled: noRows || cardProduct !== null || listPrinting, onSelect: () => setListPrinting(true) },
                ]}
              />
              {canAdjust && (
                <button type="button" onClick={() => setImportOpen(true)} className={btn.primary}>
                  <FileSpreadsheet size={16} /> {t("stock.import.button")}
                </button>
              )}
            </>
          )}
        />

        <div data-tour="stock-kpis" className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label={t("stock.kpi.itemCount")} value={activeProducts.length.toLocaleString("th-TH")} unit={t("stock.unit.items")} />
          <StatCard label={t("stock.kpi.totalUnitsShort")} value={totalUnits.toLocaleString("th-TH")} unit={t("stock.unit.units")} />
          <StatCard label={t("stock.kpi.stockValueShort")} value={`฿${money(totalValue)}`} />
          <StatCard label={t("stock.kpi.zeroStock")} value={zeroStockCount.toLocaleString("th-TH")} unit={t("stock.unit.items")} tone={zeroStockCount > 0 ? "red" : "default"} />
          <StatCard label={t("stock.kpi.lowStock")} value={lowStockCount.toLocaleString("th-TH")} unit={t("stock.unit.items")} tone={lowStockCount > 0 ? "amber" : "default"} />
        </div>

        <ListCard>
          <div data-tour="stock-search">
          <ListToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder={t("stock.search.placeholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 sm:ml-2">
              <AlertTriangle size={14} className="text-[#8a5a00]" aria-hidden="true" /> {t("stock.lowStockBadge")}
            </span>
          </ListToolbar>
          </div>

          {activeProducts.length === 0 ? (
            <ListEmpty title={t("stock.empty.title")} hint={t("stock.empty.description")} />
          ) : noRows ? (
            <ListEmpty title={t("stock.noMatch")} />
          ) : (
            <div data-tour="stock-table" className="overflow-x-auto">
              <table className="w-full min-w-[1100px] table-fixed">
                <thead>
                  <tr className={table.head}>
                    <th className={`${table.th} w-[160px]`}>{t("stock.table.code")}</th>
                    <th className={table.th}>{t("stock.table.nameCategory")}</th>
                    <th className={`${table.th} w-[120px] text-right`}>{t("stock.table.remaining")}</th>
                    <th className={`${table.th} w-[112px] text-right`}>{t("stock.table.avgCost")}</th>
                    <th className={`${table.th} w-[120px] text-right`}>{t("stock.table.lastCost")}</th>
                    <th className={`${table.th} w-[124px] text-right`}>{t("stock.table.value")}</th>
                    <th className={`${table.th} w-[96px] text-right`}>{t("stock.table.reorderPoint")}</th>
                    <th className={`${table.th} w-[210px]`}><span className="sr-only">{t("ui.more")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const kit = isKitProduct(p);
                    const low = isLowStock(p);
                    const breakdown = kit ? kitBreakdownText(p.kitComponents!, 1) : "";
                    const sub = kit ? `${categoryName(p.categoryId)} · ${t("kit.perKit")} ${breakdown}` : categoryName(p.categoryId);
                    const qtyColor = p.stockQty <= 0 ? "text-[#b93636]" : low ? "text-[#8a5a00]" : "text-foreground";
                    return (
                      <tr key={p.id} className={`${table.row} text-sm`}>
                        <td className={`${table.td} ${table.code} break-all`}>{p.code}</td>
                        <td className={table.td}>
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-foreground truncate" title={p.name}>{p.name}</span>
                            {p.isTool && <Tag tone="grey">{t("stock.toolBadge")}</Tag>}
                            {kit && <Tag tone="blue" icon={Layers}>{t("products.tag.kit")}</Tag>}
                          </span>
                          <span className="block text-xs text-muted-foreground truncate" title={kit ? breakdown : undefined}>{sub}</span>
                        </td>
                        <td className={`${table.td} text-right whitespace-nowrap`}>
                          <span className={`inline-flex items-baseline justify-end gap-1.5 font-semibold tabular-nums ${qtyColor}`} title={kit ? t("kit.availableHint") : undefined}>
                            {low && p.stockQty > 0 && <AlertTriangle size={14} className="self-center" aria-label={t("stock.lowStockBadge")} />}
                            {p.stockQty.toLocaleString("th-TH")}
                            <span className="text-[13px] font-normal text-muted-foreground">{p.unit}</span>
                          </span>
                        </td>
                        <td className={`${table.td} text-right tabular-nums ${!((p.avgCost ?? 0) > 0) ? "text-[#8a97ad]" : "text-[#3d5173]"}`}>{(p.avgCost ?? 0) > 0 ? money(p.avgCost ?? 0) : "—"}</td>
                        {/* ราคาซื้อล่าสุด (2026-09-09) — ราคาที่ของคืนเข้าคลังใช้ลงบัญชี ไม่ใช่ฐานของมูลค่าสต๊อก */}
                        <td className={`${table.td} text-right tabular-nums ${(p.lastCost ?? 0) > 0 ? "text-[#3d5173]" : "text-[#8a97ad]"}`}
                          title={(p.lastCostAt ?? "") ? t("stock.table.lastCostOn").replace("{date}", (p.lastCostAt ?? "").slice(0, 10)) : t("stock.table.lastCostHint")}>
                          {(p.lastCost ?? 0) > 0 ? money(p.lastCost ?? 0) : "—"}
                        </td>
                        <td className={`${table.td} text-right tabular-nums ${stockValueOf(p) > 0 ? "font-semibold text-foreground" : "text-[#8a97ad]"}`}>{stockValueOf(p) > 0 ? money(stockValueOf(p)) : "—"}</td>
                        <td className={`${table.td} text-right`}>
                          {canAdjust ? (
                            <input
                              type="number"
                              min={0}
                              defaultValue={p.reorderPoint ?? 0}
                              disabled={savingReorderId === p.id}
                              aria-label={`${t("stock.table.reorderPoint")} — ${p.name}`}
                              onBlur={(e) => void saveReorderPoint(p, e.target.value)}
                              className={`${field.cell} w-[72px] text-right tabular-nums disabled:opacity-50`}
                            />
                          ) : (
                            <span className="tabular-nums text-muted-foreground">{(p.reorderPoint ?? 0) || "—"}</span>
                          )}
                        </td>
                        <td className={table.td}>
                          {kit ? (
                            <p className="text-xs leading-snug text-muted-foreground">{t("kit.noOwnStock")}</p>
                          ) : (
                            <span className="flex items-center justify-end gap-0.5">
                              <button type="button" onClick={() => onOpenHistory(p.id)} className={btn.icon} title={t("stock.action.viewHistoryTitle")} aria-label={`${t("stock.action.viewHistoryTitle")} — ${p.name}`}>
                                <History size={16} />
                              </button>
                              <button type="button" onClick={() => void printStockCard(p)} disabled={cardProduct !== null} className={btn.icon} title={t("stock.action.stockCardTitle")} aria-label={`${t("stock.action.stockCardTitle")} — ${p.name}`}>
                                <ClipboardList size={16} />
                              </button>
                              <button type="button" onClick={() => void exportCardXlsx(p)} disabled={exporting} className={btn.icon} title={t("stock.action.stockCardExcelTitle")} aria-label={`${t("stock.action.stockCardExcelTitle")} — ${p.name}`}>
                                <Sheet size={16} />
                              </button>
                              {canAdjust && (
                                <button type="button" data-tour={p.id === firstAdjustableId ? "stock-adjust" : undefined} onClick={() => setAdjustTarget(p)} className={`${btn.secondarySm} ml-1.5`}>
                                  {t("stock.action.adjustBtn")}
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ListCard>
      </div>

      {importOpen && (
        <StockImportDialog
          products={products}
          onClose={() => setImportOpen(false)}
          onImported={async () => {
            localEditsRef.current += 1;
            onProductsChange(await fetchProducts());
          }}
        />
      )}
      {adjustTarget && (
        <AdjustStockDialog
          product={adjustTarget}
          onSaved={handleAdjustSaved}
          onCancel={() => setAdjustTarget(null)}
        />
      )}
      <Toast message={toast.message} />

      {/* ใบนับสต๊อก — อยู่ใน DOM ตลอด ซ่อนอยู่จนกว่าจะพิมพ์ กด Ctrl+P ก็ได้ใบเดียวกัน
          ยกเว้นตอนกำลังพิมพ์การ์ดสต๊อกของสินค้าตัวหนึ่ง ซึ่งจะเข้ามาแทนที่ชั่วคราว */}
      {listPrinting ? (
        <TablePrintDocument sheet={balanceSheet()} companyHeader={companyHeader} docLabel="STOCK" printedAt={printDate(printedAt)} />
      ) : cardProduct && cardMovements !== null ? (
        <StockCardPrintDocument product={cardProduct} movements={cardMovements} companyHeader={companyHeader} printedAt={printedAt} />
      ) : (
        <StockCountSheetPrintDocument
          products={filtered}
          categories={categories}
          companyHeader={companyHeader}
          printedAt={printedAt}
          countedBy={currentUserName}
        />
      )}
    </div>
  );
}

const ADJUST_KINDS = ["receive", "deduct", "adjust"] as const;

function AdjustStockDialog({ product, onSaved, onCancel }: {
  product: Product;
  onSaved: (productId: string, movement: StockMovement) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<StockMovementKind>("receive");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { t } = useI18n();

  const handleSave = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 0 || (kind !== "adjust" && n <= 0)) {
      setError(kind === "adjust" ? t("stock.dialog.error.nonZeroRequired") : t("stock.dialog.error.positiveRequired"));
      return;
    }
    const cost = unitCost.trim() === "" ? undefined : Number(unitCost);
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      setError(t("stock.dialog.error.unitCostInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const movement = kind === "adjust"
        ? await createStockMovement({ productId: product.id, kind, delta: n, reason: reason.trim() })
        : await createStockMovement({ productId: product.id, kind, qty: n, reason: reason.trim(), unitCost: kind === "receive" ? cost : undefined });
      onSaved(product.id, movement);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("stock.dialog.error.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const qtyLabel = kind === "adjust" ? t("stock.dialog.field.adjustQty") : t("stock.dialog.field.qty");

  return (
    <FormDialog
      icon={SlidersHorizontal}
      title={`${t("stock.dialog.adjustTitle")} — ${product.name}`}
      description={(
        <>
          <span className="font-mono text-[13px]">{product.code}</span> · {t("stock.dialog.currentBalancePrefix")}{" "}
          <strong className="font-semibold text-foreground tabular-nums">{product.stockQty.toLocaleString("th-TH")}</strong> {product.unit}
        </>
      )}
      busy={busy}
      error={error}
      confirmLabel={busy ? t("stock.dialog.saving") : t("stock.dialog.save")}
      onConfirm={() => void handleSave()}
      onCancel={onCancel}
    >
      <div role="radiogroup" aria-label={t("stock.dialog.kindLabel")} className="grid grid-cols-3 gap-0.5 p-[3px] bg-[#eef1f6] rounded-lg">
        {ADJUST_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => { setKind(k); setError(""); }}
            className={`h-[34px] rounded-md text-sm transition-colors ${kind === k ? "bg-white text-foreground font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)]" : "text-muted-foreground font-medium hover:text-foreground"}`}
          >
            {t(STOCK_MOVEMENT_KIND_LABEL_KEY[k])}
          </button>
        ))}
      </div>

      <div className={`grid gap-4 ${kind === "receive" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        <Field label={qtyLabel} htmlFor="stock-adjust-qty" required>
          <UnitInput
            id="stock-adjust-qty"
            type="number"
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={kind === "adjust" ? t("stock.dialog.field.adjustPlaceholder") : "0"}
            unit={product.unit || undefined}
          />
        </Field>
        {/* ต้นทุน/หน่วยตอนรับเข้า — ไม่บังคับ ถ้ากรอกจะถัวเฉลี่ยใหม่ (ใบรับสินค้าส่งราคาจริงมาเองอยู่แล้ว
            ช่องนี้สำหรับรับเข้าด้วยมือ เช่นยอดตั้งต้น) */}
        {kind === "receive" && (
          <Field label={t("stock.dialog.field.unitCost")} htmlFor="stock-adjust-cost">
            <UnitInput
              id="stock-adjust-cost"
              type="number" min={0} step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder={(product.avgCost ?? 0) > 0 ? money(product.avgCost ?? 0) : "0.00"}
              unit={t("stock.unit.baht")}
            />
          </Field>
        )}
      </div>
      {kind === "receive" && <p className={`${field.help} -mt-2`}>{t("stock.dialog.unitCostHint")}</p>}

      <Field label={t("stock.dialog.field.reason")} htmlFor="stock-adjust-reason">
        <input
          id="stock-adjust-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={kind === "receive" ? t("stock.dialog.placeholder.receive") : kind === "deduct" ? t("stock.dialog.placeholder.deduct") : t("stock.dialog.placeholder.adjust")}
          className={`${field.input} w-full`}
        />
      </Field>
    </FormDialog>
  );
}
