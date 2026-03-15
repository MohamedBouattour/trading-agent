"use client";

import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, ReferenceLine } from 'recharts';
import { ArrowUpCircle, ArrowDownCircle, MinusCircle, DollarSign, Activity } from 'lucide-react';

interface DecisionRecord {
  timestamp: string;
  ticker: string;
  decision: string;
  reason: string;
  tp: number | null;
  sl: number | null;
  markPrice: number;
  unRealizedProfit: number;
  actionTaken: string;
}

interface DashboardProps {
  data: DecisionRecord[];
  ticker: string;
}

export default function Dashboard({ data, ticker }: DashboardProps) {
  const [selectedRecord, setSelectedRecord] = useState<DecisionRecord | null>(null);

  const stats = useMemo(() => {
    if (!data.length) return { totalPnL: 0, latestMarkPrice: 0, totalDecisions: 0 };
    let totalPnL = 0;
    
    // Simplistic PnL aggregate just for display, in real life you'd track realized.
    // We can show the latest unRealizedProfit or a delta. Let's just sum deltas or show the max PnL.
    const lastRecord = data[data.length - 1];
    return {
      totalPnL: lastRecord.unRealizedProfit,
      latestMarkPrice: lastRecord.markPrice,
      totalDecisions: data.length
    };
  }, [data]);

  const pnlData = data.map((d, i) => ({
    time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    pnl: d.unRealizedProfit,
    price: d.markPrice,
    decision: d.decision,
    action: d.actionTaken,
    raw: d
  }));

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-neutral-900 border border-neutral-800 rounded-xl">
        <Activity className="w-12 h-12 text-neutral-500 mb-4" />
        <h2 className="text-xl font-medium text-neutral-300">No decisions found for {ticker}</h2>
        <p className="text-neutral-500 mt-2 text-center">Run the TradingBot to generate data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center text-neutral-400 mb-2">
            <DollarSign className="w-5 h-5 mr-2" />
            <h3 className="font-medium">Total Unrealized PnL</h3>
          </div>
          <div className={`text-3xl font-bold ${stats.totalPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {stats.totalPnL > 0 ? "+" : ""}{stats.totalPnL.toFixed(2)} USDT
          </div>
        </div>
        
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center text-neutral-400 mb-2">
            <Activity className="w-5 h-5 mr-2" />
            <h3 className="font-medium">Last Mark Price</h3>
          </div>
          <div className="text-3xl font-bold text-white">
            {stats.latestMarkPrice.toFixed(2)}
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center text-neutral-400 mb-2">
            <Activity className="w-5 h-5 mr-2" />
            <h3 className="font-medium">Total Runs</h3>
          </div>
          <div className="text-3xl font-bold text-indigo-400">
            {stats.totalDecisions}
          </div>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4">PnL Over Time</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="time" stroke="#666" fontSize={12} tickLine={false} />
              <YAxis 
                stroke="#666" 
                fontSize={12} 
                tickLine={false} 
                tickFormatter={(value) => `${value.toFixed(1)}`} 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#171717', border: '1px solid #333', borderRadius: '8px' }}
                labelStyle={{ color: '#999' }}
              />
              <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
              <Line 
                type="monotone" 
                dataKey="pnl" 
                stroke="#6366f1" 
                strokeWidth={3}
                dot={{ r: 4, fill: "#6366f1", strokeWidth: 2, stroke: "#171717" }}
                activeDot={{ r: 6, fill: "#818cf8" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4">Decision Logs</h3>
        <div className="grid gap-4">
          {data.slice().reverse().map((record, i) => (
            <div 
              key={i} 
              className="bg-neutral-800/50 rounded-lg p-5 border border-neutral-800 hover:border-neutral-700 transition"
              onClick={() => setSelectedRecord(selectedRecord === record ? null : record)}
            >
              <div className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center space-x-4">
                  {record.decision === "BUY" ? (
                    <ArrowUpCircle className="text-emerald-400 w-8 h-8" />
                  ) : record.decision === "SELL" ? (
                    <ArrowDownCircle className="text-rose-400 w-8 h-8" />
                  ) : (
                    <MinusCircle className="text-neutral-500 w-8 h-8" />
                  )}
                  <div>
                    <div className="text-sm text-neutral-400">
                      {new Date(record.timestamp).toLocaleString()}
                    </div>
                    <div className="font-bold text-lg flex items-center gap-2">
                      {record.decision} 
                      {record.actionTaken !== record.decision && (
                        <span className="text-xs bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-full font-medium">
                          Taken: {record.actionTaken}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-medium ${record.unRealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {record.unRealizedProfit > 0 ? "+" : ""}{record.unRealizedProfit.toFixed(2)} USDT
                  </div>
                  <div className="text-sm font-mono text-neutral-500">
                    Mark: {record.markPrice.toFixed(2)}
                  </div>
                </div>
              </div>
              
              {selectedRecord === record && (
                <div className="mt-4 pt-4 border-t border-neutral-800 text-sm text-neutral-300 leading-relaxed">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                      <span className="text-neutral-500 block mb-1">Take Profit</span>
                      <span className="font-mono text-emerald-400">{record.tp?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                      <span className="text-neutral-500 block mb-1">Stop Loss</span>
                      <span className="font-mono text-rose-400">{record.sl?.toFixed(2) || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="p-4 bg-neutral-900 rounded-lg border border-neutral-800 font-serif">
                    <span className="font-semibold text-white block mb-2">Reasoning</span>
                    {record.reason}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
