import { useState } from "react";
import type { Company } from "../../lib/storage";
import type { Product, ProductCategory } from "../../lib/products";
import { type Quote, type QuoteInterest, type QuoteStatus, type QuoteLine, cloneLines, nextQuoteId } from "../../lib/quotes";
import { QuoteList } from "./QuoteList";
import { QuoteDocument } from "./QuoteDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

export function QuotationPage({
  quotes,
  setQuotes,
  company,
  products,
  categories,
}: {
  quotes: Quote[];
  setQuotes: React.Dispatch<React.SetStateAction<Quote[]>>;
  company: Company;
  products: Product[];
  categories: ProductCategory[];
}) {
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toast = useToast();

  const selectedQuote = quotes.find((q) => q.id === selectedId);

  const setInterest = (id: string, v: QuoteInterest) =>
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, interest: v } : q)));

  const handleSave = (data: { client: string; status: QuoteStatus; lines: QuoteLine[]; discount: number; amount: number }) => {
    if (view === "new") {
      const id = nextQuoteId(quotes);
      const today = new Date();
      const newQuote: Quote = {
        id,
        client: data.client,
        date: today.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
        valid: new Date(today.getTime() + 30 * 86400000).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
        amount: data.amount,
        status: data.status,
        salesperson: "นภา ลาเรนต์",
        interest: null,
        lines: data.lines,
        discount: data.discount,
      };
      setQuotes((prev) => [newQuote, ...prev]);
      setSelectedId(id);
      setView("detail");
    } else if (selectedQuote) {
      setQuotes((prev) => prev.map((q) => (q.id === selectedQuote.id ? { ...q, ...data } : q)));
    }
  };

  const handleDuplicate = () => {
    if (!selectedQuote) return;
    const id = nextQuoteId(quotes);
    const duplicate: Quote = {
      ...selectedQuote,
      id,
      status: "ร่าง",
      interest: null,
      lines: cloneLines(selectedQuote.lines),
    };
    setQuotes((prev) => [duplicate, ...prev]);
    setSelectedId(id);
    toast.show("คัดลอกใบเสนอราคาเรียบร้อยแล้ว");
  };

  if (view === "list") {
    return (
      <>
        <QuoteList
          quotes={quotes}
          onOpen={(id) => { setSelectedId(id); setView("detail"); }}
          onCreateNew={() => { setSelectedId(null); setView("new"); }}
          onInterestChange={setInterest}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  return (
    <>
      <QuoteDocument
        key={view === "detail" ? selectedId ?? "new" : "new"}
        mode={view === "detail" ? "detail" : "new"}
        quote={view === "detail" ? selectedQuote : undefined}
        nextId={nextQuoteId(quotes)}
        company={company}
        products={products}
        categories={categories}
        onBack={() => setView("list")}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onInterestChange={(v) => selectedQuote && setInterest(selectedQuote.id, v)}
        showToast={toast.show}
      />
      <Toast message={toast.message} />
    </>
  );
}
