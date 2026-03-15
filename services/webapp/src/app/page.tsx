import fs from 'fs';
import path from 'path';
import Dashboard from '@/components/Dashboard';

export default async function Home() {
  const resultsDir = process.env.RESULTS_DIR || './results';
  const ticker = process.env.TICKER || 'BTCUSDT';
  const decisionsFile = path.resolve(resultsDir, `${ticker}_decisions.json`);

  let data = [];
  try {
    if (fs.existsSync(decisionsFile)) {
      const fileData = fs.readFileSync(decisionsFile, 'utf-8');
      data = JSON.parse(fileData);
    }
  } catch (error) {
    console.error('Error reading decisions file:', error);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">TradingAgents Dashboard</h1>
          <p className="text-neutral-400 mt-2">Monitoring AI Decisions over time.</p>
        </header>
        <Dashboard data={data} ticker={ticker} />
      </div>
    </main>
  );
}
