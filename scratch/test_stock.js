async function testStock() {
  const ticker = 'AAPL';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log('Failed:', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    const currency = data.chart?.result?.[0]?.meta?.currency;
    console.log(`Ticker: ${ticker}`);
    console.log(`Current Price: ${price}`);
    console.log(`Currency: ${currency}`);
  } catch (err) {
    console.error('Error fetching stock price:', err);
  }
}

testStock();
