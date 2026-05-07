/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, ChangeEvent, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  CreditCard, 
  TrendingUp, 
  TrendingDown, 
  ShoppingCart, 
  AlertCircle,
  ChevronRight,
  RefreshCw,
  X,
  Search,
  Save,
  History,
  Trash2,
  Calendar,
  BarChart3,
  Edit,
  PieChart as PieChartIcon
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { extractTransactions } from './services/geminiService';
import { ExtractionResult, TransactionType, VendorSummary, SavedReport } from './types';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'reading' | 'analyzing' | 'finalizing'>('idle');
  const [results, setResults] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [selectedVendorSummary, setSelectedVendorSummary] = useState<VendorSummary | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [isLandingView, setIsLandingView] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Sync isLandingView with results
  useEffect(() => {
    if (results) setIsLandingView(false);
  }, [results]);

  const [categories, setCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('spendwise_categories');
      const parsed = saved ? JSON.parse(saved) : ['Fashion', 'Marketplace', 'Other'];
      return Array.isArray(parsed) ? parsed : ['Fashion', 'Marketplace', 'Other'];
    } catch (e) {
      return ['Fashion', 'Marketplace', 'Other'];
    }
  });

  const [categoryMapping, setCategoryMapping] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('spendwise_category_mapping');
      const parsed = saved ? JSON.parse(saved) : {
        'H&M': 'Fashion',
        'Zara': 'Fashion',
        'Myntra': 'Fashion',
        'Ajio': 'Fashion',
        'Nykaa': 'Fashion',
        'Reliance Trends': 'Fashion',
        'Max Fashion': 'Fashion',
        'Pantaloons': 'Fashion',
        'Meesho': 'Fashion',
        'Amazon': 'Marketplace',
        'Flipkart': 'Marketplace',
        'Tata CLiQ': 'Marketplace',
        'Other Marketplace': 'Other'
      };
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (e) {
      return {};
    }
  });

  const [budgets, setBudgets] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('spendwise_budgets');
      const parsed = saved ? JSON.parse(saved) : { 'Fashion': 3000, 'Marketplace': 5000, 'Other': 1000 };
      return typeof parsed === 'object' && parsed !== null ? parsed : { 'Fashion': 3000, 'Marketplace': 5000, 'Other': 1000 };
    } catch (e) {
      return { 'Fashion': 3000, 'Marketplace': 5000, 'Other': 1000 };
    }
  });
  const abortControllerRef = useRef<boolean>(false);
  
  // History State
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [reportLabel, setReportLabel] = useState('');
  
  // Filtering state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('spendwise_history');
    if (saved) {
      try {
        setSavedReports(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
    // Artificial delay for smoother UX
    const timer = setTimeout(() => setIsHistoryLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  // Save history when it changes
  const updateHistory = (reports: SavedReport[]) => {
    setSavedReports(reports);
    localStorage.setItem('spendwise_history', JSON.stringify(reports));
  };

  const updateBudget = (category: string, amount: number) => {
    const newBudgets = { ...budgets, [category]: amount };
    setBudgets(newBudgets);
    localStorage.setItem('spendwise_budgets', JSON.stringify(newBudgets));
  };

  const updateCategoryMapping = (vendor: string, category: string) => {
    const newMapping = { ...categoryMapping, [vendor]: category };
    setCategoryMapping(newMapping);
    localStorage.setItem('spendwise_category_mapping', JSON.stringify(newMapping));
  };

  const manageCategories = (action: 'add' | 'remove' | 'rename', name: string, newName?: string) => {
    let nextCategories = [...categories];
    let nextBudgets = { ...budgets };
    let nextMapping = { ...categoryMapping };

    if (action === 'add') {
      if (!nextCategories.includes(name)) {
        nextCategories.push(name);
        nextBudgets[name] = 1000;
      }
    } else if (action === 'remove') {
      nextCategories = nextCategories.filter(c => c !== name);
      delete nextBudgets[name];
      // Re-map vendors using this category to 'Other' if it exists, or first category
      const fallback = nextCategories[0] || 'Other';
      Object.keys(nextMapping).forEach(vendor => {
        if (nextMapping[vendor] === name) nextMapping[vendor] = fallback;
      });
    } else if (action === 'rename' && newName) {
      nextCategories = nextCategories.map(c => c === name ? newName : c);
      nextBudgets[newName] = nextBudgets[name];
      delete nextBudgets[name];
      Object.keys(nextMapping).forEach(vendor => {
        if (nextMapping[vendor] === name) nextMapping[vendor] = newName;
      });
    }

    setCategories(nextCategories);
    setBudgets(nextBudgets);
    setCategoryMapping(nextMapping);
    localStorage.setItem('spendwise_categories', JSON.stringify(nextCategories));
    localStorage.setItem('spendwise_budgets', JSON.stringify(nextBudgets));
    localStorage.setItem('spendwise_category_mapping', JSON.stringify(nextMapping));
  };

  const VENDORS = ['H&M', 'Zara', 'Amazon', 'Flipkart', 'Myntra', 'Ajio', 'Nykaa', 'Meesho', 'Tata CLiQ', 'Reliance Trends', 'Max Fashion', 'Pantaloons', 'Other Marketplace'];

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    const validFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
    
    if (validFiles.length === 0 && selectedFiles.length > 0) {
      setError('Please upload images only.');
      return;
    }

    const newFiles = [...files, ...validFiles].slice(0, 5);
    setFiles(newFiles);
    
    // Cleanup old and set new previews
    previews.forEach(p => URL.revokeObjectURL(p));
    setPreviews(newFiles.map(f => URL.createObjectURL(f)));
    
    setResults(null);
    setError(null);
    setStatus('idle');
  };

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
    URL.revokeObjectURL(previews[index]);
    setPreviews(previews.filter((_, i) => i !== index));
    setResults(null);
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const generateId = () => {
    try {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
      }
      return Math.random().toString(36).substring(2, 11);
    } catch (e) {
      return Math.random().toString(36).substring(2, 11);
    }
  };

  const processStatement = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setStatus('reading');
    setProcessingIndex(0);
    abortControllerRef.current = false;

    const aggregatedTransactions: any[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        // Check for cancellation
        if (abortControllerRef.current) {
          console.log("Processing aborted");
          return;
        }

        setProcessingIndex(i);
        const file = files[i];
        
        setStatus('reading');
        const base64 = await readFileAsBase64(file);
        
        setStatus('analyzing');
        const result = await extractTransactions(base64, file.type);
        
        if (abortControllerRef.current) return;
        
        // Ensure each transaction has a unique ID for editing
        const txsWithIds = (result.transactions || []).map((tx: any) => ({
          ...tx,
          id: tx.id || generateId()
        }));
        
        aggregatedTransactions.push(...txsWithIds);
      }

      if (abortControllerRef.current) return;

      setStatus('finalizing');
      
      // Re-calculate aggregations for the combined set
      const summariesMap: Record<string, any> = {};
      VENDORS.forEach(v => {
        summariesMap[v] = {
          vendor: v,
          debits: [],
          credits: [],
          totalDebit: 0,
          totalCredit: 0
        };
      });

      aggregatedTransactions.forEach((tx: any) => {
        const v = VENDORS.find(vendor => tx.vendor.toLowerCase().includes(vendor.toLowerCase())) || 'Other Marketplace';
        if (summariesMap[v]) {
          if (tx.type === TransactionType.DEBIT) {
            summariesMap[v].debits.push(tx);
            summariesMap[v].totalDebit += tx.amount;
          } else {
            summariesMap[v].credits.push(tx);
            summariesMap[v].totalCredit += tx.amount;
          }
        }
      });

      const vendorSummaries = Object.values(summariesMap).filter(s => s.debits.length > 0 || s.credits.length > 0);
      
      setResults({
        transactions: aggregatedTransactions,
        vendorSummaries: vendorSummaries as any
      });
      
    } catch (err: any) {
      console.error("Processing error:", err);
      let errorMessage = 'Failed to process one or more statements. Some images might be too complex.';
      
      try {
        const errorData = typeof err === 'string' ? JSON.parse(err) : err;
        if (errorData?.error?.code === 403 || errorData?.status === 403 || (errorData?.message && errorData.message.includes('permission'))) {
          errorMessage = 'Gemini API Permission Denied (403). Please ensure your API key is correctly set in the Secrets panel and has access to the Gemini API.';
        } else if (errorData?.message) {
          errorMessage = `Processing error: ${errorData.message}`;
        }
      } catch (e) {
        if (err instanceof Error) errorMessage = `Processing error: ${err.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
      setStatus('idle');
    }
  };

  const reset = () => {
    abortControllerRef.current = true;
    previews.forEach(p => URL.revokeObjectURL(p));
    setFiles([]);
    setPreviews([]);
    setResults(null);
    setActiveReportId(null);
    setError(null);
    setStatus('idle');
    setIsProcessing(false);
    setReportLabel('');
  };

  const saveCurrentReport = async () => {
    if (!results || !reportLabel.trim()) return;

    setIsSaving(true);
    // Artificial delay to show progress
    await new Promise(resolve => setTimeout(resolve, 800));

    const newReport: SavedReport = {
      id: crypto.randomUUID(),
      label: reportLabel.trim(),
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      result: results
    };

    updateHistory([newReport, ...savedReports]);
    setActiveReportId(newReport.id);
    setReportLabel('');
    setIsSaving(false);
  };

  const loadReport = (report: SavedReport) => {
    if (isProcessing) {
      if (!window.confirm('Analysis is in progress. Stop current analysis and load history?')) return;
      abortControllerRef.current = true;
      setIsProcessing(false);
    }
    
    setIsTransitioning(true);
    // Brief delay for smooth animation transition
    setTimeout(() => {
      setResults(report.result);
      setActiveReportId(report.id);
      setFiles([]);
      setPreviews([]);
      setError(null);
      setIsTransitioning(false);
    }, 500);
  };

  const deleteReport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeReportId === id) {
      setActiveReportId(null);
      setResults(null);
    }
    updateHistory(savedReports.filter(r => r.id !== id));
  };

  const updateTransactionVendor = (txId: string, newVendor: string) => {
    if (!results) return;

    const updatedTransactions = results.transactions.map(tx => 
      tx.id === txId ? { ...tx, vendor: newVendor } : tx
    );

    // Re-calculate aggregations
    const summariesMap: Record<string, any> = {};
    VENDORS.forEach(v => {
      summariesMap[v] = {
        vendor: v,
        debits: [],
        credits: [],
        totalDebit: 0,
        totalCredit: 0
      };
    });

    updatedTransactions.forEach((tx: any) => {
      const v = VENDORS.find(vendor => tx.vendor.toLowerCase().includes(vendor.toLowerCase())) || 'Other Marketplace';
      if (summariesMap[v]) {
        if (tx.type === TransactionType.DEBIT) {
          summariesMap[v].debits.push(tx);
          summariesMap[v].totalDebit += tx.amount;
        } else {
          summariesMap[v].credits.push(tx);
          summariesMap[v].totalCredit += tx.amount;
        }
      }
    });

    const vendorSummaries = Object.values(summariesMap).filter(s => s.debits.length > 0 || s.credits.length > 0);
    
    setResults({
      transactions: updatedTransactions,
      vendorSummaries: vendorSummaries as any
    });
  };

  const updateTransactionNotes = (txId: string, notes: string) => {
    if (!results) return;

    const updatedTransactions = results.transactions.map(tx => 
      tx.id === txId ? { ...tx, notes } : tx
    );

    // We need to keep indices and summaries in sync, though notes don't affect totals
    // Update transactions in the vendorSummaries structure
    const updatedVendorSummaries = results.vendorSummaries.map(summary => ({
      ...summary,
      debits: summary.debits.map(tx => tx.id === txId ? { ...tx, notes } : tx),
      credits: summary.credits.map(tx => tx.id === txId ? { ...tx, notes } : tx)
    }));

    setResults({
      transactions: updatedTransactions,
      vendorSummaries: updatedVendorSummaries
    });
  };

  const parseDate = (dateStr: string) => {
    // Try common formats DD/MM/YYYY or MM/DD/YYYY or YYYY-MM-DD
    const parts = dateStr.split(/[/.-]/);
    if (parts.length === 3) {
      // If looks like DD/MM/YYYY
      if (parts[0].length <= 2 && parts[2].length === 4) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      // If looks like YYYY-MM-DD
      if (parts[0].length === 4) {
        return new Date(dateStr);
      }
    }
    return new Date(dateStr);
  };

  const filteredResults = useMemo(() => {
    if (!results) return null;

    let filteredTxs = results.transactions.map(tx => ({ ...tx }));

    if (startDate) {
      const start = new Date(startDate);
      filteredTxs = filteredTxs.filter(tx => parseDate(tx.date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      filteredTxs = filteredTxs.filter(tx => parseDate(tx.date) <= end);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filteredTxs = filteredTxs.filter(tx => 
        tx.vendor.toLowerCase().includes(q) || 
        tx.description.toLowerCase().includes(q)
      );
    }

    // Detect recurring transactions
    // 1. Group by vendor and similar amount
    const groups: Record<string, typeof filteredTxs> = {};
    filteredTxs.forEach(tx => {
      if (tx.type !== TransactionType.DEBIT) return;
      // Use vendor and amount rounded to nearest 50 for broad detection of similar monthly bills
      const key = `${tx.vendor}-${Math.round(tx.amount / 50) * 50}`; 
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });

    Object.values(groups).forEach(group => {
      if (group.length >= 2) {
        group.forEach(tx => {
          tx.isRecurring = true;
        });
      }
    });

    // 2. Keyword based detection
    const subKeywords = ['subscription', 'premium', 'membership', 'monthly', 'netflix', 'spotify', 'youtube', 'prime', 'recharge', 'bill', 'insurance', 'rent'];
    filteredTxs.forEach(tx => {
      if (subKeywords.some(kw => tx.description.toLowerCase().includes(kw) || tx.vendor.toLowerCase().includes(kw))) {
        tx.isRecurring = true;
      }
    });

    // Re-calculate summaries for the filtered subset
    const summariesMap: Record<string, any> = {};
    VENDORS.forEach(v => {
      summariesMap[v] = {
        vendor: v,
        debits: [],
        credits: [],
        totalDebit: 0,
        totalCredit: 0
      };
    });

    filteredTxs.forEach((tx) => {
      let v = VENDORS.find(vendor => tx.vendor.toLowerCase().includes(vendor.toLowerCase()));
      
      // Better categorization: check description if vendor is generic
      if ((!v || v === 'Other Marketplace') && tx.description) {
        const descMatch = VENDORS.find(vendor => tx.description.toLowerCase().includes(vendor.toLowerCase()));
        if (descMatch) v = descMatch;
      }

      const finalVendor = v || 'Other Marketplace';
      
      if (summariesMap[finalVendor]) {
        if (tx.type === TransactionType.DEBIT) {
          summariesMap[finalVendor].debits.push(tx);
          summariesMap[finalVendor].totalDebit += tx.amount;
        } else {
          summariesMap[finalVendor].credits.push(tx);
          summariesMap[finalVendor].totalCredit += tx.amount;
        }
      }
    });

    const vendorSummaries = Object.values(summariesMap).filter(s => s.debits.length > 0 || s.credits.length > 0);

    // Calculate category summaries for budget tracking
    const categoryStats: Record<string, number> = {};
    const categoryRefundStats: Record<string, number> = {};
    
    Object.values(summariesMap).forEach((s: any) => {
      const cat = categoryMapping[s.vendor] || 'Other';
      categoryStats[cat] = (categoryStats[cat] || 0) + s.totalDebit;
      categoryRefundStats[cat] = (categoryRefundStats[cat] || 0) + s.totalCredit;
    });

    // Net spending for budget tracking
    const categoryNetStats: Record<string, number> = {};
    Object.keys(categoryStats).forEach(cat => {
      categoryNetStats[cat] = categoryStats[cat] - (categoryRefundStats[cat] || 0);
    });

    // Summarize recurring transactions
    const recurringTxs = filteredTxs.filter(tx => tx.isRecurring && tx.type === TransactionType.DEBIT);
    const recurringTotal = recurringTxs.reduce((acc, tx) => acc + tx.amount, 0);
    
    // Group recurring by vendor to show in summary
    const recurringByVendor: Record<string, { total: number, count: number, avgAmount: number }> = {};
    recurringTxs.forEach(tx => {
      if (!recurringByVendor[tx.vendor]) {
        recurringByVendor[tx.vendor] = { total: 0, count: 0, avgAmount: 0 };
      }
      recurringByVendor[tx.vendor].total += tx.amount;
      recurringByVendor[tx.vendor].count += 1;
    });
    Object.values(recurringByVendor).forEach(stat => {
      stat.avgAmount = stat.total / stat.count;
    });

    return {
      transactions: filteredTxs,
      vendorSummaries: vendorSummaries as any,
      categoryStats: categoryNetStats,
      categoryDebitStats: categoryStats,
      categoryRefundStats: categoryRefundStats,
      recurringSummary: {
        total: recurringTotal,
        count: recurringTxs.length,
        items: Object.entries(recurringByVendor).map(([vendor, stats]) => ({
          vendor,
          ...stats
        })).sort((a, b) => b.total - a.total)
      }
    };
  }, [results, startDate, endDate, searchQuery, categoryMapping]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-slate-900 flex items-center justify-between px-8 text-white flex-shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setIsLandingView(true)}>
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-bold text-sm">
            SW
          </div>
          <h1 className="text-lg font-semibold tracking-tight">SpendWise AI Pro</h1>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-300">
          <span className="hidden sm:inline">Statement Analyzer</span>
          <div className="h-8 w-8 bg-slate-800 rounded-full border border-slate-700 flex items-center justify-center font-medium text-xs text-white">
            AI
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden max-w-full">
        {/* Sidebar */}
        <aside className="w-full lg:w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-6 overflow-y-auto">
          <section>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Analysis Overview</h2>
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Debit</div>
                <div className="text-xl font-bold text-slate-900">
                  ₹{(filteredResults?.vendorSummaries.reduce((acc, s) => acc + s.totalDebit, 0) || 0).toFixed(2)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Credit</div>
                <div className="text-xl font-bold text-emerald-600">
                  ₹{(filteredResults?.vendorSummaries.reduce((acc, s) => acc + s.totalCredit, 0) || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          <section className="flex-shrink-0">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Target Vendors</h2>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {VENDORS.map(v => (
                <div key={v} className="flex justify-between items-center text-[11px] py-1 border-b border-slate-50">
                  <span className="text-slate-600 font-medium truncate max-w-[120px]">{v}</span>
                  {results && (
                    <span className="text-blue-500 font-bold">
                      {results.vendorSummaries.find(s => s.vendor === v) ? '✓' : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Budgeting Section */}
          <section className="mt-4 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                Monthly Budgets
              </h2>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-1 hover:bg-slate-100 rounded text-blue-500 transition-colors"
                title="Manage Categories"
              >
                <Edit className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-4">
              {categories.map(cat => {
                const spent = filteredResults?.categoryStats[cat] || 0;
                const budget = budgets[cat] || 0;
                const percent = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
                
                return (
                  <div key={cat} className="space-y-1.5 group">
                    <div className="flex justify-between items-center text-[9px] uppercase font-bold tracking-tighter">
                      <span className="text-slate-400">{cat}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end leading-none">
                          <span className={spent > budget ? 'text-red-500 font-black' : 'text-slate-600 font-bold'}>
                            ₹{spent.toFixed(0)} / ₹{budget}
                          </span>
                          {(filteredResults as any)?.categoryRefundStats?.[cat] > 0 && (
                            <span className="text-[7px] text-emerald-500 font-black italic mt-0.5">
                              (-₹{(filteredResults as any).categoryRefundStats[cat].toFixed(0)} refund)
                            </span>
                          )}
                        </div>
                        <button 
                          onClick={() => {
                            const val = prompt(`New budget for ${cat}:`, String(budget));
                            if (val && !isNaN(Number(val))) updateBudget(cat, Number(val));
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-100 rounded transition-opacity"
                        >
                          <Edit className="w-2.5 h-2.5 text-blue-500" />
                        </button>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        className={`h-full transition-colors duration-500 ${
                          percent >= 100 ? 'bg-red-500' : 
                          percent >= 75 ? 'bg-amber-500' : 'bg-blue-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* History Section */}
          <section className="mt-4 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <History className="w-3 h-3" />
                History
              </h2>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {isHistoryLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 w-full bg-slate-50 rounded animate-pulse border border-slate-100" />
                ))
              ) : savedReports.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic">No saved reports yet.</p>
              ) : (
                savedReports.map(report => (
                  <button
                    key={report.id}
                    onClick={() => loadReport(report)}
                    className={`w-full text-left p-2 rounded border transition-all group ${
                      activeReportId === report.id 
                      ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' 
                      : 'hover:bg-slate-50 border-transparent hover:border-slate-100'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className={`text-xs font-bold truncate ${activeReportId === report.id ? 'text-blue-700' : 'text-slate-700'}`}>
                        {report.label}
                      </span>
                      <Trash2 
                        onClick={(e) => deleteReport(report.id, e)}
                        className="w-3 h-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" 
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar className="w-2 h-2 text-slate-400" />
                      <span className="text-[9px] text-slate-400 uppercase">{report.date}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg text-[10px] text-blue-800 leading-relaxed font-medium">
            Multiple screenshots can be analyzed together (Max 5).
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto">
          {isTransitioning ? (
            <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
               <div className="flex justify-between items-end mb-8">
                 <div className="space-y-2">
                    <div className="h-8 w-64 bg-slate-100 animate-pulse rounded" />
                    <div className="h-4 w-48 bg-slate-50 animate-pulse rounded" />
                 </div>
                 <div className="h-10 w-32 bg-slate-100 animate-pulse rounded-lg" />
               </div>
               <div className="grid grid-cols-3 gap-6">
                 <div className="h-64 bg-slate-50 animate-pulse rounded-2xl border border-slate-100" />
                 <div className="h-64 bg-slate-50 animate-pulse rounded-2xl border border-slate-100" />
                 <div className="h-64 bg-slate-50 animate-pulse rounded-2xl border border-slate-100" />
               </div>
               <div className="h-96 bg-white animate-pulse rounded-2xl border border-slate-100" />
            </div>
          ) : isLandingView && !results ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-5xl mx-auto space-y-16 py-12"
            >
              {/* Hero Section */}
              <section className="text-center space-y-6">
                <motion.div 
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-widest border border-blue-100"
                >
                  <TrendingUp className="w-3 h-3" />
                  AI-Powered Financial Intelligence
                </motion.div>
                <h2 className="text-5xl md:text-6xl font-black tracking-tight text-slate-900 leading-[1.1]">
                  Master Your Spending <br/>
                  <span className="text-blue-600">With AI Precision</span>
                </h2>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
                  Turn your transaction screenshots into interactive insights. Track budgets, 
                  analyze vendor patterns, and stay ahead of your expenses in seconds.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                  <button 
                    onClick={() => setIsLandingView(false)}
                    className="px-8 py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 group"
                  >
                    Launch Analyzer 
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="px-8 py-4 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
                  >
                    Configure Budgets
                  </button>
                </div>
              </section>

              {/* Steps Section */}
              <section className="grid md:grid-cols-3 gap-8">
                <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">1. Upload</h3>
                  <p className="text-sm text-slate-500">Drop screenshots of your UPI or Bank statements. We handle multiple files at once.</p>
                </div>
                <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                    <RefreshCw className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">2. AI Analysis</h3>
                  <p className="text-sm text-slate-500">Gemini AI extracts vendors, amounts, and dates with 99% accuracy across formats.</p>
                </div>
                <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <TrendingDown className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">3. Optimize</h3>
                  <p className="text-sm text-slate-500">Set monthly targets and watch your spending health in real-time visualizations.</p>
                </div>
              </section>

              {/* Stats Teaser */}
              <section className="bg-slate-900 rounded-[2rem] p-12 text-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 blur-[100px] -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                  <div className="space-y-6">
                    <h3 className="text-3xl font-bold">Privacy-First Insights</h3>
                    <p className="text-slate-400 leading-relaxed">
                      All processing happens securely. We don't store your original statements, 
                      only the extracted metadata used for your personal dashboard.
                    </p>
                    <div className="flex gap-8">
                      <div>
                        <div className="text-3xl font-black text-blue-400">0</div>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Manual Entry</div>
                      </div>
                      <div>
                        <div className="text-3xl font-black text-blue-400">100%</div>
                        <div className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Secure</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-6 border border-white/10 backdrop-blur-md">
                   <div className="flex items-center gap-4 mb-6">
                     <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                       <BarChart3 className="w-5 h-5 text-white" />
                     </div>
                     <span className="font-bold">Live Breakdown Demo</span>
                   </div>
                   <div className="space-y-4 opacity-50">
                     {[1, 2, 3].map(i => (
                       <div key={i} className="h-2 bg-white/10 rounded-full w-full overflow-hidden">
                         <div className="h-full bg-blue-500 w-[60%]" />
                       </div>
                     ))}
                   </div>
                  </div>
                </div>
              </section>
            </motion.div>
          ) : !results ? (
            <div className="max-w-3xl mx-auto space-y-8">
              <div className="text-center lg:text-left flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">Statement Analysis</h2>
                  <p className="text-slate-500">
                    Upload up to 5 screenshots of your statements.
                  </p>
                </div>
                {files.length > 0 && !isProcessing && (
                  <button 
                    onClick={reset}
                    className="text-xs font-bold uppercase text-slate-400 hover:text-red-500"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {files.length < 5 && !isProcessing && (
                <div className="relative group">
                  <input
                    type="file"
                    id="statement-upload"
                    className="hidden"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                  <label
                    htmlFor="statement-upload"
                    className="flex flex-col items-center justify-center w-full h-48 border border-slate-200 rounded-xl bg-white cursor-pointer hover:border-blue-400 hover:bg-blue-50/20 transition-all duration-300 shadow-sm"
                  >
                    <div className="bg-slate-50 p-4 rounded-xl mb-4 group-hover:scale-110 group-hover:bg-blue-50 transition-transform duration-300">
                      <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />
                    </div>
                    <p className="text-lg font-semibold text-slate-700">Add {files.length > 0 ? 'More' : ''} Screenshots</p>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">{files.length}/5 Slots Used</p>
                  </label>
                </div>
              )}

              {files.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="grid md:grid-cols-2 gap-4">
                    {files.map((f, i) => (
                      <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-100 p-2 rounded-lg">
                              <FileText className="w-4 h-4 text-slate-600" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 truncate max-w-[120px]">{f.name}</p>
                              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                          {!isProcessing && (
                            <button 
                              onClick={() => removeFile(i)}
                              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {previews[i] && (
                          <div className="aspect-video rounded-lg overflow-hidden bg-slate-50 border border-slate-100 relative group/preview">
                            <img 
                              src={previews[i]} 
                              alt="Preview" 
                              className={`w-full h-full object-contain transition-all duration-500 ${
                                isProcessing && processingIndex === i ? 'scale-105 blur-[2px] opacity-40' : 
                                isProcessing && i < processingIndex ? 'grayscale opacity-30 scale-95' : ''
                              }`} 
                            />
                            {isProcessing && processingIndex === i && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                                  className="w-10 h-10 bg-white rounded-full shadow-xl flex items-center justify-center border-2 border-blue-500/20"
                                >
                                  <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                                </motion.div>
                                <span className="text-[9px] font-black uppercase text-blue-600 bg-white/80 px-2 py-0.5 rounded-full shadow-sm backdrop-blur-sm">
                                  {status}...
                                </span>
                              </div>
                            )}
                            {isProcessing && i < processingIndex && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-8 h-8 bg-emerald-500 rounded-full shadow-lg flex items-center justify-center text-white">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={processStatement}
                      disabled={isProcessing}
                      className="flex-1 relative overflow-hidden py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin relative z-10" />
                          <span className="relative z-10">
                            File {processingIndex + 1}/{files.length}: 
                            {status === 'reading' && ' Reading...'}
                            {status === 'analyzing' && ' Searching Transactions...'}
                            {status === 'finalizing' && ' Combining Data...'}
                          </span>
                          <motion.div 
                            className="absolute inset-0 bg-blue-600/20"
                            initial={{ left: '-100%' }}
                            animate={{ left: '100%' }}
                            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                          />
                        </>
                      ) : (
                        <>
                          Analyze {files.length} Screenshots
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                    {isProcessing && (
                      <button
                        onClick={reset}
                        className="px-6 py-4 border border-slate-200 text-slate-500 font-bold rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex flex-col gap-6 mb-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-2xl font-bold text-slate-800">Transaction Summary</h2>
                      {activeReportId && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase rounded-md flex items-center gap-1">
                          Viewing: {savedReports.find(r => r.id === activeReportId)?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">Filtered results for target vendors</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Search</label>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                          <input 
                            type="text"
                            placeholder="Vendor or description..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="text-[10px] pl-7 pr-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">From</label>
                        <input 
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="text-[10px] px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">To</label>
                        <input 
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="text-[10px] px-2 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                      </div>
                      {(startDate || endDate || searchQuery) && (
                        <button 
                          onClick={() => { setStartDate(''); setEndDate(''); setSearchQuery(''); }}
                          className="mt-4 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3 flex-1">
                    <input 
                      type="text"
                      placeholder="Label report (e.g. May Shopping)"
                      value={reportLabel}
                      onChange={(e) => setReportLabel(e.target.value)}
                      className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 flex-1 max-w-xs"
                    />
                    <button 
                      onClick={saveCurrentReport}
                      disabled={!reportLabel.trim() || !results || isSaving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-700 disabled:bg-slate-200 flex items-center gap-2 transition-all min-w-[125px] justify-center"
                    >
                      {isSaving ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-3 h-3" /> Save Result
                        </>
                      )}
                    </button>
                  </div>
                  <button onClick={reset} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors flex items-center gap-2 whitespace-nowrap">
                    <RefreshCw className="w-4 h-4" /> New Upload
                  </button>
                </div>
              </div>

              {filteredResults && filteredResults.vendorSummaries.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-blue-50 p-2 rounded-lg">
                      <BarChart3 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Spending Breakdown</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Debit by Vendor</p>
                    </div>
                  </div>
                  
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={filteredResults.vendorSummaries.map(s => ({
                          name: s.vendor,
                          amount: s.totalDebit,
                          totalCredit: s.totalCredit
                        })).sort((a, b) => b.amount - a.amount)}
                        margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                          dx={-10}
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length && payload[0]?.payload) {
                              const vendor = payload[0].payload.name;
                              const category = (categoryMapping && vendor) ? (categoryMapping[vendor] || 'Other') : 'Other';
                              const budget = (budgets && category) ? (budgets[category] || 0) : 0;
                              const spent = filteredResults?.categoryStats ? (filteredResults.categoryStats[category] || 0) : 0;
                              const isOver = budget > 0 && spent > budget;
                              
                              return (
                                <div className="bg-slate-900 text-white p-4 text-xs rounded-xl shadow-2xl border border-slate-800 min-w-[160px]">
                                  <div className="flex justify-between items-start mb-3">
                                    <div>
                                      <p className="font-bold text-sm">{vendor || 'Unknown'}</p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{category}</p>
                                    </div>
                                    {isOver && (
                                      <div className="bg-red-500/20 text-red-400 p-1 rounded-md">
                                        <AlertCircle className="w-3.5 h-3.5" />
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Vendor Debit:</span>
                                      <span className="font-bold text-red-400">₹{(payload[0].value as number)?.toLocaleString() || 0}</span>
                                    </div>
                                    {payload[0].payload.totalCredit > 0 && (
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Vendor Refund:</span>
                                        <span className="font-bold text-emerald-400">₹{payload[0].payload.totalCredit.toLocaleString()}</span>
                                      </div>
                                    )}
                                    <div className="pt-2 border-t border-slate-800">
                                      <div className="flex justify-between mb-1">
                                        <span className="text-slate-400">Category Budget:</span>
                                        <span className="font-bold">₹{budget.toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Net Cat Spent:</span>
                                        <span className={`font-bold ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>
                                          ₹{spent.toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                    {budget > 0 && (
                                      <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                          className={`h-full ${isOver ? 'bg-red-500' : 'bg-blue-500'}`} 
                                          style={{ width: `${Math.min((spent / budget) * 100, 100)}%` }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar 
                          dataKey="amount" 
                          radius={[6, 6, 0, 0]}
                          barSize={40}
                        >
                          {filteredResults.vendorSummaries.map((entry, index) => {
                            const category = categoryMapping[entry.vendor] || 'Other';
                            const budget = budgets[category] || 0;
                            const spent = filteredResults?.categoryStats[category] || 0;
                            const isOver = budget > 0 && spent > budget;
                            
                            return (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={isOver ? '#ef4444' : [
                                  '#3b82f6', // Blue
                                  '#8b5cf6', // Violet
                                  '#ec4899', // Pink
                                  '#f59e0b', // Amber
                                  '#10b981', // Emerald
                                  '#6366f1'  // Indigo
                                ][index % 6]} 
                                stroke={isOver ? '#fca5a5' : 'none'}
                                strokeWidth={isOver ? 2 : 0}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}

              {filteredResults && filteredResults.recurringSummary.items.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid lg:grid-cols-3 gap-6"
                >
                  <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 p-2 rounded-lg">
                        <RefreshCw className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-800">Fixed Commitments</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Recurring monthly bills</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-2xl font-black text-slate-900 leading-none">
                        ₹{filteredResults.recurringSummary.total.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                        Total across {filteredResults.recurringSummary.count} transactions
                      </p>
                    </div>

                    <div className="pt-4 border-t border-slate-50 space-y-3">
                      {filteredResults.recurringSummary.items.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center group">
                          <div>
                            <p className="text-[11px] font-bold text-slate-700">{item.vendor}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter italic">Avg: ₹{item.avgAmount.toFixed(0)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-black text-blue-600">₹{item.total.toLocaleString()}</p>
                            <p className="text-[9px] text-slate-300 font-bold">x{item.count}</p>
                          </div>
                        </div>
                      ))}
                      {filteredResults.recurringSummary.items.length > 3 && (
                        <button className="text-[9px] font-bold text-blue-500 uppercase tracking-widest hover:underline pt-2">
                          + {filteredResults.recurringSummary.items.length - 3} more recurring vendors
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-2 bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] -translate-y-1/2 translate-x-1/2" />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h4 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-1 italic">Subscription Insights</h4>
                          <p className="text-lg font-black leading-tight">Identify and manage <br/> fixed overheads.</p>
                        </div>
                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
                          <AlertCircle className="w-5 h-5 text-blue-400" />
                        </div>
                      </div>
                      
                      <div className="mt-auto space-y-4">
                        <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                          Fixed monthly expenses account for <span className="text-blue-400 font-bold">
                            {((filteredResults.recurringSummary.total / (filteredResults?.vendorSummaries.reduce((acc: number, s: any) => acc + s.totalDebit, 0) || 1)) * 100).toFixed(0)}%
                          </span> of your total spending in this report.
                        </p>
                        <div className="flex gap-4">
                          <button 
                            onClick={() => {
                              setSearchQuery('subscription');
                            }}
                            className="px-4 py-2 bg-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors"
                          >
                            Analyze Fixed Costs
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {filteredResults && filteredResults.vendorSummaries.length === 0 ? (
                <div className="bg-white p-16 rounded-xl border border-slate-200 text-center space-y-4">
                  <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                    <AlertCircle className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">No Transactions Match Filter</h3>
                  <p className="text-slate-400 max-w-sm mx-auto">
                    Try clearing your date range filters if you don't see any results.
                  </p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredResults?.vendorSummaries.map((summary: VendorSummary) => (
                    <VendorCard 
                      key={summary.vendor} 
                      summary={summary} 
                      onUpdateVendor={updateTransactionVendor}
                      vendorList={VENDORS}
                      onViewDetails={() => setSelectedVendorSummary(summary)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          <AnimatePresence>
            {isSettingsOpen && (
              <BudgetSettingsModal 
                categories={categories}
                onManageCategories={manageCategories}
                vendorMapping={categoryMapping}
                onUpdateMapping={updateCategoryMapping}
                vendors={VENDORS}
                onClose={() => setIsSettingsOpen(false)}
              />
            )}
            {selectedVendorSummary && (
              <VendorDetailsModal 
                summary={selectedVendorSummary}
                vendorList={VENDORS}
                onClose={() => setSelectedVendorSummary(null)}
                onUpdateVendor={(txId, newVendor) => {
                  updateTransactionVendor(txId, newVendor);
                  // Update the local modal summary as well
                  const updatedTxs = [...selectedVendorSummary.debits, ...selectedVendorSummary.credits].map(tx => 
                    tx.id === txId ? { ...tx, vendor: newVendor } : tx
                  );
                  // We need to re-find the summary since setResults is async and might not be ready
                  // better to just update what's in the modal state
                  setSelectedVendorSummary({
                    ...selectedVendorSummary,
                    debits: updatedTxs.filter(tx => tx.type === TransactionType.DEBIT),
                    credits: updatedTxs.filter(tx => tx.type === TransactionType.CREDIT)
                  });
                }}
                onUpdateNotes={(txId, notes) => {
                  updateTransactionNotes(txId, notes);
                  const updatedTxs = [...selectedVendorSummary.debits, ...selectedVendorSummary.credits].map(tx => 
                    tx.id === txId ? { ...tx, notes } : tx
                  );
                  setSelectedVendorSummary({
                    ...selectedVendorSummary,
                    debits: updatedTxs.filter(tx => tx.type === TransactionType.DEBIT),
                    credits: updatedTxs.filter(tx => tx.type === TransactionType.CREDIT)
                  });
                }}
              />
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-4 bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-xs font-bold uppercase tracking-tight">{error}</p>
            </div>
          )}
        </div>
      </main>

      {/* Global Status Bar */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 border border-white/10 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
              <div className="flex flex-col">
                <span className="text-xs font-bold whitespace-nowrap">
                   {status === 'reading' && 'Extracting Data...'}
                   {status === 'analyzing' && 'Analyzing with AI...'}
                   {status === 'finalizing' && 'Synthesizing Results...'}
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  File {processingIndex + 1} of {files.length}
                </span>
              </div>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <button 
              onClick={reset}
              className="text-[10px] font-black uppercase text-red-400 hover:text-red-300 transition-colors"
            >
              Stop
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface VendorCardProps {
  summary: VendorSummary;
  onUpdateVendor: (txId: string, newVendor: string) => void;
  vendorList: string[];
  onViewDetails: () => void;
}

const VendorCard: React.FC<VendorCardProps> = ({ 
  summary, 
  onUpdateVendor,
  vendorList,
  onViewDetails
}) => {
  return (
    <motion.div 
      layout
      className="bg-white border border-slate-200 rounded-xl flex flex-col shadow-sm overflow-hidden h-fit group transition-all hover:border-blue-300 hover:shadow-md cursor-pointer"
      onClick={onViewDetails}
    >
      <div className="p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-slate-800">{summary.vendor}</h3>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold uppercase tracking-wider text-slate-600">
              {summary.debits.length + summary.credits.length} Activity
            </span>
            {([...summary.debits, ...summary.credits].filter(t => t.isRecurring).length > 0) && (
              <span className="text-[8px] text-blue-600 font-bold uppercase tracking-widest flex items-center gap-1">
                <RefreshCw className="w-2 h-2" />
                { [...summary.debits, ...summary.credits].filter(t => t.isRecurring).length } Recurring
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Debit</span>
            <span className="font-bold text-slate-900 text-sm italic">₹{summary.totalDebit.toFixed(2)}</span>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
            <span className="block text-[10px] text-emerald-700 uppercase font-bold mb-1">Credit</span>
            <span className="font-bold text-emerald-600 text-sm italic">₹{summary.totalCredit.toFixed(2)}</span>
          </div>
        </div>

        <button 
          className="w-full py-2 bg-slate-50 group-hover:bg-blue-50 rounded text-[10px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-blue-600 transition-colors"
        >
          View & Categorize
        </button>
      </div>
    </motion.div>
  );
}

function BudgetSettingsModal({
  categories,
  onManageCategories,
  vendorMapping,
  onUpdateMapping,
  vendors,
  onClose
}: {
  categories: string[],
  onManageCategories: (action: 'add' | 'remove' | 'rename', name: string, newName?: string) => void,
  vendorMapping: Record<string, string>,
  onUpdateMapping: (vendor: string, category: string) => void,
  vendors: string[],
  onClose: () => void
}) {
  const [newCategoryName, setNewCategoryName] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Budget Settings</h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Manage Categories & Mappings</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid md:grid-cols-2">
          {/* Left: Category Management */}
          <div className="p-6 border-r border-slate-100 space-y-6">
            <section>
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4">Categories</h3>
              <div className="space-y-2 mb-4">
                {categories.map(cat => (
                  <div key={cat} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg group">
                    <span className="text-sm font-bold text-slate-700">{cat}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          const newName = prompt(`Rename ${cat} to:`, cat);
                          if (newName && newName !== cat) onManageCategories('rename', cat, newName);
                        }}
                        className="p-1.5 hover:bg-white rounded text-blue-500 shadow-sm transition-all"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      {categories.length > 1 && (
                        <button 
                          onClick={() => {
                            if (window.confirm(`Delete category "${cat}"? Vendors will be re-assigned.`)) {
                              onManageCategories('remove', cat);
                            }
                          }}
                          className="p-1.5 hover:bg-white rounded text-red-400 shadow-sm transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="New Category..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button 
                  onClick={() => {
                    if (newCategoryName.trim()) {
                      onManageCategories('add', newCategoryName.trim());
                      setNewCategoryName('');
                    }
                  }}
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Add
                </button>
              </div>
            </section>
          </div>

          {/* Right: Vendor Mapping */}
          <div className="p-6 bg-slate-50/30 overflow-y-auto">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4">Vendor Mapping</h3>
            <div className="space-y-2">
              {vendors.map(vendor => (
                <div key={vendor} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg shadow-sm">
                  <span className="text-[11px] font-bold text-slate-600 truncate max-w-[120px]">{vendor}</span>
                  <select 
                    value={vendorMapping[vendor] || categories[0]}
                    onChange={(e) => onUpdateMapping(vendor, e.target.value)}
                    className="text-[10px] p-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 w-28"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function VendorDetailsModal({
  summary,
  vendorList,
  onClose,
  onUpdateVendor,
  onUpdateNotes
}: {
  summary: VendorSummary,
  vendorList: string[],
  onClose: () => void,
  onUpdateVendor: (txId: string, newVendor: string) => void,
  onUpdateNotes: (txId: string, notes: string) => void
}) {
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [modalStartDate, setModalStartDate] = useState('');
  const [modalEndDate, setModalEndDate] = useState('');
  const [minAmount, setMinAmount] = useState<number>(0);
  const [maxAmount, setMaxAmount] = useState<number>(() => {
    const allTxs = [...(summary.debits || []), ...(summary.credits || [])];
    const amounts = allTxs.map(t => Number(t.amount)).filter(a => !isNaN(a));
    return amounts.length > 0 ? Math.max(...amounts) : 10000;
  });

  const parseModalDate = (dateStr: string) => {
    const parts = dateStr.split(/[/.-]/);
    if (parts.length === 3) {
      if (parts[0].length <= 2 && parts[2].length === 4) {
        return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
      if (parts[0].length === 4) return new Date(dateStr);
    }
    return new Date(dateStr);
  };

  const filteredTransactions = useMemo(() => {
    return [...summary.debits, ...summary.credits].filter(tx => {
      const amountMatch = tx.amount >= minAmount && tx.amount <= maxAmount;
      
      let dateMatch = true;
      const txDate = parseModalDate(tx.date);
      if (modalStartDate) {
        dateMatch = dateMatch && txDate >= new Date(modalStartDate);
      }
      if (modalEndDate) {
        dateMatch = dateMatch && txDate <= new Date(modalEndDate);
      }
      
      return amountMatch && dateMatch;
    }).sort((a, b) => parseModalDate(b.date).getTime() - parseModalDate(a.date).getTime());
  }, [summary, modalStartDate, modalEndDate, minAmount, maxAmount]);

  const filteredStats = useMemo(() => {
    return {
      debit: filteredTransactions.filter(t => t.type === TransactionType.DEBIT).reduce((acc, t) => acc + t.amount, 0),
      credit: filteredTransactions.filter(t => t.type === TransactionType.CREDIT).reduce((acc, t) => acc + t.amount, 0)
    };
  }, [filteredTransactions]);

  const absoluteMax = useMemo(() => {
    const allTxs = [...summary.debits, ...summary.credits];
    return allTxs.length > 0 ? Math.max(...allTxs.map(t => t.amount)) : 10000;
  }, [summary]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{summary.vendor}</h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Detailed Breakdown</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">Filter by Amount (₹{minAmount} - ₹{maxAmount})</label>
              <div className="flex gap-4">
                <input 
                  type="range" 
                  min="0" 
                  max={absoluteMax} 
                  value={maxAmount} 
                  onChange={(e) => setMaxAmount(Number(e.target.value))}
                  className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">From</label>
                <input 
                  type="date" 
                  value={modalStartDate}
                  onChange={(e) => setModalStartDate(e.target.value)}
                  className="w-full text-xs p-1.5 rounded-lg border border-slate-200 bg-white"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-tighter">To</label>
                <input 
                  type="date" 
                  value={modalEndDate}
                  onChange={(e) => setModalEndDate(e.target.value)}
                  className="w-full text-xs p-1.5 rounded-lg border border-slate-200 bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 gap-4">
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Filtered Debit</span>
            </div>
            <span className="text-2xl font-black text-slate-900">₹{filteredStats.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-emerald-600 uppercase font-bold tracking-widest">Filtered Credit</span>
            </div>
            <span className="text-2xl font-black text-emerald-600">₹{filteredStats.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredTransactions.length === 0 ? (
            <div className="py-20 text-center text-slate-400 italic">No transactions match these filters.</div>
          ) : (
            filteredTransactions.map((tx, i) => (
              <div key={tx.id || i} className="group p-4 bg-white border border-slate-100 rounded-xl hover:border-blue-200 transition-all">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col flex-1 pr-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${
                        tx.type === TransactionType.CREDIT ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {tx.type}
                      </span>
                      {tx.isRecurring && (
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter bg-blue-100 text-blue-700 flex items-center gap-1">
                          <RefreshCw className="w-2 h-2" />
                          Recurring
                        </span>
                      )}
                      <div className="h-px w-4 bg-slate-100" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tx.date}</span>
                    </div>
                    
                    <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2 text-xs">
                      <span className="text-[9px] font-bold text-slate-400 uppercase self-center">Vendor</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-600 px-2 py-0.5 bg-blue-50 rounded border border-blue-100">{tx.vendor}</span>
                      </div>

                      <span className="text-[9px] font-bold text-slate-400 uppercase pt-1">Description</span>
                      <span className="text-slate-800 font-medium leading-tight pt-0.5">{tx.description}</span>

                      <span className="text-[9px] font-bold text-slate-400 uppercase pt-1">Notes</span>
                      <div className="pt-0.5 space-y-2">
                        {editingNotesId === tx.id ? (
                          <div className="flex gap-2">
                            <input 
                              type="text"
                              value={noteValue}
                              onChange={(e) => setNoteValue(e.target.value)}
                              className="flex-1 text-[11px] px-2 py-1 border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              placeholder="Add a note..."
                              autoFocus
                            />
                            <button 
                              onClick={() => {
                                onUpdateNotes(tx.id, noteValue);
                                setEditingNotesId(null);
                              }}
                              className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded hover:bg-blue-700"
                            >
                              Save
                            </button>
                            <button 
                              onClick={() => setEditingNotesId(null)}
                              className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded hover:bg-slate-200"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={() => {
                              setEditingNotesId(tx.id);
                              setNoteValue(tx.notes || '');
                            }}
                            className="group/note cursor-pointer min-h-[1.5rem] flex items-center gap-2"
                          >
                            <span className={`text-[11px] ${tx.notes ? 'text-slate-600 italic' : 'text-slate-300'}`}>
                              {tx.notes || 'Add personal note...'}
                            </span>
                            <Edit className="w-3 h-3 text-blue-500 opacity-0 group-hover/note:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end">
                    <span className={`text-lg font-black block leading-none ${tx.type === TransactionType.CREDIT ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {tx.type === TransactionType.CREDIT ? '+' : ''}₹{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    
                    {editingTxId !== tx.id ? (
                      <button 
                        onClick={() => setEditingTxId(tx.id)}
                        className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mt-2 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                      >
                        Change Category
                      </button>
                    ) : (
                      <div className="flex flex-col items-end gap-2 mt-2">
                         <select 
                            className="text-[10px] p-2 border border-blue-200 rounded-lg bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-40"
                            value={tx.vendor}
                            onChange={(e) => {
                              onUpdateVendor(tx.id, e.target.value);
                              setEditingTxId(null);
                            }}
                          >
                            {vendorList.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                          <button 
                            onClick={() => setEditingTxId(null)}
                            className="text-[9px] font-bold text-red-400 uppercase tracking-widest mr-2"
                          >
                            Cancel
                          </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
