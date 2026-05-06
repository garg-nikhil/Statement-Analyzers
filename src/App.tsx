/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, ChangeEvent, useEffect, useRef } from 'react';
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
  Save,
  History,
  Trash2,
  Calendar,
  BarChart3,
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
  const [status, setStatus] = useState<'idle' | 'reading' | 'analyzing' | 'finalizing'>('idle');
  const [results, setResults] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const abortControllerRef = useRef<boolean>(false);
  
  // History State
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [reportLabel, setReportLabel] = useState('');
  
  // Filtering state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

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
  }, []);

  // Save history when it changes
  const updateHistory = (reports: SavedReport[]) => {
    setSavedReports(reports);
    localStorage.setItem('spendwise_history', JSON.stringify(reports));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
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
        
        aggregatedTransactions.push(...result.transactions);
      }

      if (abortControllerRef.current) return;

      setStatus('finalizing');
      
      // Re-calculate aggregations for the combined set
      const VENDORS = ['H&M', 'Zara', 'Amazon', 'Flipkart', 'Myntra', 'Ajio'];
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
        const v = VENDORS.find(vendor => tx.vendor.toLowerCase().includes(vendor.toLowerCase())) || tx.vendor;
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
      
    } catch (err) {
      console.error("Processing error:", err);
      setError('Failed to process one or more statements. Some images might be too complex.');
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

  const saveCurrentReport = () => {
    if (!results || !reportLabel.trim()) return;

    const newReport: SavedReport = {
      id: crypto.randomUUID(),
      label: reportLabel.trim(),
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      result: results
    };

    updateHistory([newReport, ...savedReports]);
    setActiveReportId(newReport.id);
    setReportLabel('');
  };

  const loadReport = (report: SavedReport) => {
    if (isProcessing) {
      if (!window.confirm('Analysis is in progress. Stop current analysis and load history?')) return;
      abortControllerRef.current = true;
      setIsProcessing(false);
    }
    setResults(report.result);
    setActiveReportId(report.id);
    setFiles([]);
    setPreviews([]);
    setError(null);
  };

  const deleteReport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeReportId === id) {
      setActiveReportId(null);
      setResults(null);
    }
    updateHistory(savedReports.filter(r => r.id !== id));
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

  const filteredResults = (() => {
    if (!results) return null;

    let filteredTxs = [...results.transactions];

    if (startDate) {
      const start = new Date(startDate);
      filteredTxs = filteredTxs.filter(tx => parseDate(tx.date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      filteredTxs = filteredTxs.filter(tx => parseDate(tx.date) <= end);
    }

    // Re-calculate summaries for the filtered subset
    const VENDORS = ['H&M', 'Zara', 'Amazon', 'Flipkart', 'Myntra', 'Ajio'];
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
      const v = VENDORS.find(vendor => tx.vendor.toLowerCase().includes(vendor.toLowerCase())) || tx.vendor;
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

    return {
      transactions: filteredTxs,
      vendorSummaries: vendorSummaries as any
    };
  })();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-slate-900 flex items-center justify-between px-8 text-white flex-shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
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

          <section className="flex-1">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Target Vendors</h2>
            <div className="space-y-2">
              {['Amazon', 'Zara', 'Flipkart', 'Myntra', 'Ajio', 'H&M'].map(v => (
                <div key={v} className="flex justify-between items-center text-sm py-1 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">{v}</span>
                  {results && (
                    <span className="text-slate-400 text-[10px] font-bold">
                      {results.vendorSummaries.find(s => s.vendor === v) ? '✓' : ''}
                    </span>
                  )}
                </div>
              ))}
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
              {savedReports.length === 0 ? (
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
          {!results ? (
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
                          <div className="aspect-video rounded-lg overflow-hidden bg-slate-50 border border-slate-100">
                            <img src={previews[i]} alt="Preview" className="w-full h-full object-contain" />
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
                      {(startDate || endDate) && (
                        <button 
                          onClick={() => { setStartDate(''); setEndDate(''); }}
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
                      disabled={!reportLabel.trim() || !results}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-700 disabled:bg-slate-200 flex items-center gap-2 transition-colors"
                    >
                      <Save className="w-3 h-3" /> Save Result
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
                          amount: s.totalDebit
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
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-slate-900 text-white p-2 text-xs rounded-lg shadow-xl border border-slate-800">
                                  <p className="font-bold mb-1">{payload[0].payload.name}</p>
                                  <p className="text-blue-400 italic">₹{payload[0].value.toLocaleString()}</p>
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
                          {filteredResults.vendorSummaries.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={[
                                '#3b82f6', // Blue
                                '#8b5cf6', // Violet
                                '#ec4899', // Pink
                                '#f59e0b', // Amber
                                '#10b981', // Emerald
                                '#6366f1'  // Indigo
                              ][index % 6]} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
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
                  {filteredResults?.vendorSummaries.map((summary) => (
                    <VendorCard key={summary.vendor} summary={summary} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 text-red-700 p-4 rounded-xl flex items-center gap-3 border border-red-100">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-xs font-bold uppercase tracking-tight">{error}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function VendorCard({ summary }: { summary: VendorSummary }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div 
      layout
      className="bg-white border border-slate-200 rounded-xl flex flex-col shadow-sm overflow-hidden h-fit"
    >
      <div className="p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-slate-800">{summary.vendor}</h3>
          <span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold uppercase tracking-wider text-slate-600">
            {summary.debits.length + summary.credits.length} Activity
          </span>
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
          onClick={() => setIsOpen(!isOpen)}
          className="w-full py-2 bg-slate-50 hover:bg-slate-100 rounded text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors"
        >
          {isOpen ? 'Close History' : 'View Transactions'}
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-100 bg-slate-50/30 overflow-hidden"
          >
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Live Activity</div>
                <div className="space-y-1">
                  {[...summary.debits, ...summary.credits].map((tx, i) => (
                    <div key={i} className="flex justify-between items-center text-xs py-1">
                      <div className="flex flex-col">
                        <span className="text-slate-700 font-medium truncate max-w-[120px]">{tx.description}</span>
                        <span className="text-[9px] text-slate-400 uppercase">{tx.date}</span>
                      </div>
                      <span className={`font-bold ${tx.type === TransactionType.CREDIT ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {tx.type === TransactionType.CREDIT ? '+' : ''}₹{tx.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
