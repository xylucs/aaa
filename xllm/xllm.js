const axios = require('axios');
const ethers = require('ethers');
const prompt = require('prompt-sync')();
const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bold: "\x1b[1m"
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`\n${colors.white}[➤] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log('---------------------------------------------');
    console.log('   XLLM Auto Ref - Airdrop Insiders');
    console.log('---------------------------------------------');
    console.log(`${colors.reset}`);
    console.log();
  }
};

const API_BASE = 'https://api.xllm2.com';

const BASE_HEADERS = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.5',
  'content-type': 'application/json',
  'priority': 'u=1, i',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'sec-gpc': '1',
  'Referer': 'https://xllm2.com/',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const HUMAN_NAMES = [
  'James Smith', 'Emma Johnson', 'Liam Brown', 'Olivia Davis', 'Noah Wilson',
  'Sophia Martinez', 'William Taylor', 'Ava Anderson', 'Mason Thomas', 'Isabella Jackson',
  'Ethan White', 'Mia Harris', 'Alexander Clark', 'Charlotte Lewis', 'Daniel Walker',
  'Amelia Hall', 'Henry Allen', 'Harper Young', 'Lucas King', 'Evelyn Scott'
];

async function loadReferralCode() {
  try {
    const code = await fs.readFile('code.txt', 'utf8');
    return code.trim();
  } catch (error) {
    logger.error('Error reading code.txt: ' + error.message);
    process.exit(1);
  }
}

async function loadProxies() {
  try {
    const data = await fs.readFile('proxies.txt', 'utf8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line);
    return proxies;
  } catch (error) {
    logger.error('Error reading proxies.txt: ' + error.message);
    return [];
  }
}

function formatProxy(proxy) {
  if (proxy.startsWith('http://') || proxy.startsWith('https://') ||
      proxy.startsWith('socks://') || proxy.startsWith('socks4://') ||
      proxy.startsWith('socks5://')) {
    return proxy;
  }

  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(proxy)) {
    return `http://${proxy}`;
  }

  if (/^.+:.+@\d+\.\d+\.\d+\.\d+:\d+$/.test(proxy)) {
    return `http://${proxy}`;
  }

  if (/^.+:.+@.+:\d+$/.test(proxy)) {
    return `http://${proxy}`;
  }

  return `http://${proxy}`;
}

async function validateProxy(proxy) {
  const formattedProxy = formatProxy(proxy);
  try {
    const agent = new HttpsProxyAgent(formattedProxy, { timeout: 5000 });
    await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: agent,
      timeout: 5000, 
    });
    return true;
  } catch (error) {
    logger.warn(`Proxy validation failed for ${proxy}: ${error.message}`);
    return false;
  }
}

function getRandomUserAgent() {
  const browsers = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
  ];
  return browsers[Math.floor(Math.random() * browsers.length)];
}

function generateWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.address, 
  };
}

async function signMessage(wallet, message) {
  const signer = new ethers.Wallet(wallet.privateKey);
  return await signer.signMessage(message);
}

async function saveWallets(wallets) {
  try {
    await fs.writeFile('wallets.json', JSON.stringify(wallets, null, 2));
    logger.success('Wallets saved to wallets.json');
  } catch (error) {
    logger.error('Error saving wallets: ' + error.message);
  }
}

function createAxiosInstance(proxy) {
  const config = { headers: { ...BASE_HEADERS, 'user-agent': getRandomUserAgent() } };
  if (proxy) {
    const formattedProxy = formatProxy(proxy);
    try {
      config.httpsAgent = new HttpsProxyAgent(formattedProxy, { timeout: 5000 });
    } catch (error) {
      logger.error(`Failed to create proxy agent for ${proxy}: ${error.message}`);
    }
  }
  return axios.create(config);
}

async function signIn(walletAddress, referralCode, axiosInstance) {
  try {
    const response = await axiosInstance.post(`${API_BASE}/v1/users/sign-in`, {
      walletAddress,
      referralCode,
    });
    return response.data.data; 
  } catch (error) {
    logger.error('Sign-in error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function verifySignIn(wallet, signature, message, axiosInstance) {
  try {
    const response = await axiosInstance.post(`${API_BASE}/v1/users/sign-in/verify`, {
      signature,
      walletAddress: wallet.address,
      chain: 1,
      publicKey: wallet.publicKey,
    });
    return response.data.data; 
  } catch (error) {
    logger.error('Verify sign-in error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function checkAuth(token, axiosInstance) {
  try {
    const response = await axiosInstance.get(`${API_BASE}/v1/users/auth-available`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return response.data.status;
  } catch (error) {
    logger.error('Auth check error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function getBalance(token, axiosInstance) {
  try {
    const response = await axiosInstance.get(`${API_BASE}/v1/users/balance`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return response.data.data;
  } catch (error) {
    logger.error('Balance check error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function getProfile(token, axiosInstance) {
  try {
    const response = await axiosInstance.get(`${API_BASE}/v1/users/profile`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return response.data.data;
  } catch (error) {
    logger.error('Profile fetch error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function linkWallet(token, walletAddress, axiosInstance) {
  try {
    const response = await axiosInstance.post(`${API_BASE}/v1/users/wallets/link`, {
      platformAddress: walletAddress,
      platform: 'Galxe',
    }, {
      headers: { authorization: `Bearer ${token}` },
    });
    logger.success('Wallet linked to Galxe');
    return response.data;
  } catch (error) {
    logger.error('Link wallet error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function updateNickname(token, axiosInstance) {
  const nickname = HUMAN_NAMES[Math.floor(Math.random() * HUMAN_NAMES.length)];
  try {
    const response = await axiosInstance.put(`${API_BASE}/v1/users/profile`, {
      nickname,
    }, {
      headers: { authorization: `Bearer ${token}` },
    });
    logger.success(`Nickname updated to ${nickname}`);
    return nickname;
  } catch (error) {
    logger.error('Update nickname error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function checkIn(token, axiosInstance) {
  try {
    const response = await axiosInstance.post(`${API_BASE}/v1/check-in`, {}, {
      headers: { authorization: `Bearer ${token}` },
    });
    logger.success('Check-in successful');
    return response.data;
  } catch (error) {
    logger.error('Check-in error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function completeTwitterTask(token, axiosInstance) {
  try {
    const response = await axiosInstance.post(`${API_BASE}/v1/tasks/claim/one-time-follow-twitter`, {}, {
      headers: { authorization: `Bearer ${token}` },
    });
    logger.success('Task one-time-follow-twitter claimed');
    return response.data;
  } catch (error) {
    logger.error('Error claiming task one-time-follow-twitter: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function chatAgent(token, axiosInstance) {
  try {
    const response = await axiosInstance.post(`${API_BASE}/v2/chat?token_address=xllm2_agent&conversation_id=1`, {
      stream: true,
      msg: 'Surprise me',
    }, {
      headers: { authorization: `Bearer ${token}` },
    });
    logger.success('Chat agent interaction successful');
    return response.data;
  } catch (error) {
    logger.error('Chat agent error: ' + (error.response?.data?.error?.message || error.message));
    throw error;
  }
}

async function processWallet(wallet, referralCode, index, proxies) {
  let axiosInstance = createAxiosInstance(null); 
  let currentProxy = null;

  const availableProxies = [...proxies];
  while (availableProxies.length > 0) {
    currentProxy = availableProxies[Math.floor(Math.random() * availableProxies.length)];
    logger.info(`Trying proxy: ${currentProxy || 'None'}`);
    
    if (currentProxy && await validateProxy(currentProxy)) {
      axiosInstance = createAxiosInstance(currentProxy);
      break;
    } else {
      logger.warn(`Proxy ${currentProxy} is invalid or unreachable, removing from pool`);
      availableProxies.splice(availableProxies.indexOf(currentProxy), 1);
      currentProxy = null;
      axiosInstance = createAxiosInstance(null); 
    }
  }

  if (!currentProxy && availableProxies.length === 0 && proxies.length > 0) {
    logger.warn('All proxies failed, proceeding without proxy');
  }

  try {
    logger.step(`Processing wallet ${index + 1}: ${wallet.address}`);

    logger.loading('Initiating sign-in...');
    const message = await signIn(wallet.address, referralCode, axiosInstance);

    logger.loading('Signing message...');
    const signature = await signMessage(wallet, message);

    logger.loading('Verifying sign-in...');
    const token = await verifySignIn(wallet, signature, message, axiosInstance);

    logger.loading('Checking authentication...');
    const authStatus = await checkAuth(token, axiosInstance);
    if (!authStatus) throw new Error('Authentication failed');

    logger.loading('Fetching balance...');
    const balance = await getBalance(token, axiosInstance);
    logger.info('Balance: ' + JSON.stringify(balance));

    logger.loading('Fetching profile...');
    const profile = await getProfile(token, axiosInstance);
    logger.info('Profile: ' + JSON.stringify(profile));

    logger.step('Linking wallet to Galxe...');
    await linkWallet(token, wallet.address, axiosInstance);

    logger.step('Updating nickname...');
    const nickname = await updateNickname(token, axiosInstance);

    logger.step('Performing check-in...');
    await checkIn(token, axiosInstance);

    logger.step('Claiming Twitter task...');
    await completeTwitterTask(token, axiosInstance);

    logger.step('Interacting with chat agent...');
    await chatAgent(token, axiosInstance);
    
    logger.success(`Wallet ${index + 1} processed successfully`);
    return { ...wallet, token, nickname, proxy: currentProxy };
  } catch (error) {
    logger.error(`Error processing wallet ${index + 1} with proxy ${currentProxy || 'none'}: ${error.message}`);
    return null;
  }
}

async function main() {
  
  logger.banner();

  logger.loading('Loading referral code...');
  const referralCode = await loadReferralCode();
  logger.info('Referral code: ' + referralCode);

  logger.loading('Loading proxies...');
  const proxies = await loadProxies();
  logger.info(`Loaded ${proxies.length} proxies`);

  const numWallets = parseInt(prompt('Enter the number of wallets to generate and register: '));
  if (isNaN(numWallets) || numWallets <= 0) {
    logger.error('Invalid number of wallets');
    return;
  }

  logger.loading('Generating wallets...');
  const wallets = [];
  for (let i = 0; i < numWallets; i++) {
    wallets.push(generateWallet());
  }
  logger.info(`${wallets.length} wallets generated`);

  const processedWallets = [];
  for (let i = 0; i < wallets.length; i++) {
    const result = await processWallet(wallets[i], referralCode, i, proxies);
    if (result) {
      processedWallets.push(result);
    }
  }

  logger.loading('Saving wallets...');
  await saveWallets(processedWallets);
  logger.success('All wallets processed');
}

main().catch(error => logger.error('Main execution error: ' + error.message));