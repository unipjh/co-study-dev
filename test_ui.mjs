import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
await page.screenshot({ path: 'test_home.png', fullPage: false });
console.log('Home page screenshot taken');
await browser.close();
