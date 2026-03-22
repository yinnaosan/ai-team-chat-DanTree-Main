import { createRequire } from 'module';
import { execSync } from 'child_process';

// 直接读取 .env 文件验证 Key 是否注入
const result = execSync('cat /home/ubuntu/ai-team-chat/.env 2>/dev/null | grep -E "FINNHUB|FMP_API|POLYGON|ALPHA_VANTAGE|COINGECKO|FRED_API|NEWS_API|MARKETAUX|SIMFIN|TIINGO|CONGRESS|COURTLISTENER|TAVILY_API_KEY" | wc -l').toString().trim();
console.log('Keys in .env:', result);

const content = execSync('cat /home/ubuntu/ai-team-chat/.env 2>/dev/null | grep -E "FINNHUB|FMP_API|POLYGON|ALPHA_VANTAGE|COINGECKO|FRED_API|NEWS_API|MARKETAUX|SIMFIN|TIINGO|CONGRESS|COURTLISTENER|TAVILY_API_KEY"').toString();
const lines = content.trim().split('\n');
for (const line of lines) {
  const [key, ...rest] = line.split('=');
  const val = rest.join('=');
  console.log(key + ': ' + (val ? val.slice(0, 8) + '...' : 'EMPTY'));
}
