const axios = require('axios');
const nacl = require('tweetnacl');
const Base58 = require('base-58');
const fs = require('fs');
const prompt = require('prompt-sync')();
const { TextEncoder } = require('util');
const { HttpsProxyAgent } = require('https-proxy-agent'); 
const { HttpProxyAgent } = require('http-proxy-agent'); 
const { SocksProxyAgent } = require('socks-proxy-agent'); 

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const emoji = {
  success: '✅',
  error: '❌',
  wallet: '💼',
  rocket: '🚀',
  key: '🔑',
  user: '👤',
  wait: '⏳',
  info: 'ℹ️',
  check: '✓',
  warning: '⚠️'
};

const BASE_URL = 'https://ggsol-back-3s3u6.ondigitalocean.app';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; 

let INVITE_CODE = 'TOXNEKW1'; 

function showBanner() {
  const bannerText = "GGSOL Auto Ref - Airdrop Insiders";
  const bannerWidth = bannerText.length + 10;
  const line = colors.cyan + '-'.repeat(bannerWidth) + colors.reset;

  console.log('\n' + line);
  console.log(`${colors.cyan}--${colors.reset}  ${colors.bright}${colors.white}${bannerText}${colors.reset}  ${colors.cyan}--${colors.reset}`);
  console.log(line + '\n');
}

const headers = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.7',
  'content-type': 'application/json',
  'priority': 'u=1, i',
  'sec-ch-ua': '"Brave";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site',
  'sec-gpc': '1',
  'Referer': 'https://ggsol.io/',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function parseProxy(proxy) {
  proxy = proxy.trim();

  if (!proxy.startsWith('http://') && !proxy.startsWith('https://') && 
      !proxy.startsWith('socks4://') && !proxy.startsWith('socks5://')) {
    proxy = `http://${proxy}`;
  }

  const proxyRegex = /^(https?|socks4|socks5):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/;
  const match = proxy.match(proxyRegex);
  if (!match) {
    console.log(`${emoji.warning} ${colors.yellow}Invalid proxy format: ${proxy}${colors.reset}`);
    return null;
  }

  return proxy;
}

function getProxy(index, proxies) {
  if (proxies.length === 0) return null;
  return proxies[index % proxies.length];
}

function createAxiosInstance(proxy) {
  const axiosConfig = {
    headers: { ...headers },
    timeout: 10000 
  };

  if (proxy) {
    try {
      if (proxy.startsWith('http://')) {
        axiosConfig.httpAgent = new HttpProxyAgent(proxy);
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxy);
      } else if (proxy.startsWith('https://')) {
        axiosConfig.httpAgent = new HttpProxyAgent(proxy);
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxy);
      } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
        const socksAgent = new SocksProxyAgent(proxy);
        axiosConfig.httpAgent = socksAgent;
        axiosConfig.httpsAgent = socksAgent;
      }
      
      console.log(`${emoji.info} ${colors.green}Proxy agent created successfully for ${proxy}${colors.reset}`);
    } catch (error) {
      console.error(`${emoji.error} ${colors.red}Failed to create proxy agent for ${proxy}: ${error.message}${colors.reset}`);
      return axios.create({ headers: { ...headers }, timeout: 10000 }); 
    }
  }

  return axios.create(axiosConfig);
}

function generateRandomUsername() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let username = '';
  for (let i = 0; i < 8; i++) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return username;
}

function generateWallet() {
  const keypair = nacl.sign.keyPair();
  return {
    publicKey: Base58.encode(keypair.publicKey),
    secretKey: Base58.encode(keypair.secretKey)
  };
}

function signMessage(message, secretKey) {
  const encodedMessage = new TextEncoder().encode(message);
  const decodedSecretKey = Base58.decode(secretKey);
  const signature = nacl.sign.detached(encodedMessage, decodedSecretKey);
  console.log(`${emoji.key} ${colors.white}Signature length: ${signature.length} bytes${colors.reset}`);
  return Buffer.from(signature).toString('base64');
}

async function getNonce(address, axiosInstance, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`${emoji.info} ${colors.white}Requesting nonce for address: ${address.substring(0, 10)}... (Attempt ${attempt}/${retries})${colors.reset}`);
      const response = await axiosInstance.post(`${BASE_URL}/auth/nonce`, { address }, { headers });

      const fullMessage = response.data.message || `You are logged in to GGSOL by nonce token: ${response.data.nonce}`;
      const nonceMatch = fullMessage.match(/nonce token: (\d+)/);

      if (nonceMatch && nonceMatch[1]) {
        return {
          nonce: nonceMatch[1],
          fullMessage
        };
      } else {
        throw new Error('Could not extract nonce from server response');
      }
    } catch (error) {
      console.error(`${emoji.error} ${colors.red}Error getting nonce: ${error.message} (Attempt ${attempt}/${retries})${colors.reset}`);
      if (error.response) {
        console.error(`${colors.red}Response status: ${error.response.status}${colors.reset}`);
      }
      if (attempt < retries && (error.code === 'EAI_AGAIN' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT')) {
        console.log(`${emoji.wait} ${colors.yellow}Retrying in ${RETRY_DELAY / 1000} seconds...${colors.reset}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        throw error;
      }
    }
  }
}

async function login(address, secretKey, nonceData, axiosInstance, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const message = nonceData.fullMessage;
      const signature = signMessage(message, secretKey);

      console.log(`${emoji.key} ${colors.white}Attempting login with address: ${address.substring(0, 10)}... (Attempt ${attempt}/${retries})${colors.reset}`);

      const response = await axiosInstance.post(`${BASE_URL}/auth/login`, {
        address,
        message,
        signature,
        publicKeyStr: address
      }, { headers });

      return response.data.accessToken;
    } catch (error) {
      console.error(`${emoji.error} ${colors.red}Error logging in: ${error.message} (Attempt ${attempt}/${retries})${colors.reset}`);
      if (error.response) {
        console.error(`${colors.red}Response status: ${error.response.status}${colors.reset}`);
      }
      if (attempt < retries && (error.code === 'EAI_AGAIN' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT')) {
        console.log(`${emoji.wait} ${colors.yellow}Retrying in ${RETRY_DELAY / 1000} seconds...${colors.reset}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      } else {
        throw error;
      }
    }
  }
}

async function updateUserWithInviteCode(token, nickname, axiosInstance) {
  try {
    console.log(`${emoji.user} ${colors.white}Updating user with nickname: ${nickname}${colors.reset}`);
    const response = await axiosInstance.post(`${BASE_URL}/user/update`, {
      nickname,
      invitedByReferralCode: INVITE_CODE 
    }, {
      headers: {
        ...headers,
        'authorization': `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error(`${emoji.error} ${colors.red}Error updating user with invite code: ${error.message}${colors.reset}`);
    if (error.response) {
      console.error(`${colors.red}Response status: ${error.response.status}${colors.reset}`);
    }
    throw error;
  }
}

async function getUserInfo(token, axiosInstance) {
  try {
    const response = await axiosInstance.get(`${BASE_URL}/user`, {
      headers: {
        ...headers,
        'authorization': `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error(`${emoji.error} ${colors.red}Error getting user info: ${error.message}${colors.reset}`);
    if (error.response) {
      console.error(`${colors.red}Response status: ${error.response.status}${colors.reset}`);
    }
    throw error;
  }
}

function saveWallet(walletData) {
  let wallets = [];
  try {
    wallets = JSON.parse(fs.readFileSync('wallets.json', 'utf-8'));
  } catch (e) {}
  wallets.push(walletData);
  fs.writeFileSync('wallets.json', JSON.stringify(wallets, null, 2));
}

async function createAndRegisterWallet(index, proxies) {
  let proxy = getProxy(index - 1, proxies);
  let axiosInstance = createAxiosInstance(proxy);

  const proxyInfo = proxy ? ` using proxy ${colors.yellow}${proxy}${colors.reset}` : '';
  console.log(`\n${colors.cyan}[${index}]${colors.reset} ${emoji.wallet} ${colors.white}Starting registration${proxyInfo}${colors.reset}`);

  try {
    const wallet = generateWallet();
    const username = generateRandomUsername();
    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.wallet} ${colors.green}Generated wallet: ${wallet.publicKey.substring(0, 10)}...${colors.reset}`);
    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.user} ${colors.green}Generated username: ${username}${colors.reset}`);

    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.info} ${colors.white}Getting nonce...${colors.reset}`);
    let nonceData;
    try {
      nonceData = await getNonce(wallet.publicKey, axiosInstance);
    } catch (error) {
      console.log(`${emoji.warning} ${colors.yellow}Proxy ${proxy || 'direct'} failed, falling back to direct connection...${colors.reset}`);
      axiosInstance = createAxiosInstance(null); 
      nonceData = await getNonce(wallet.publicKey, axiosInstance);
    }
    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.check} ${colors.green}Got nonce: ${nonceData.nonce}${colors.reset}`);

    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.info} ${colors.white}Logging in...${colors.reset}`);
    const token = await login(wallet.publicKey, wallet.secretKey, nonceData, axiosInstance);
    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.check} ${colors.green}Logged in successfully${colors.reset}`);

    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.info} ${colors.white}Updating user with invite code ${INVITE_CODE}...${colors.reset}`);
    await updateUserWithInviteCode(token, username, axiosInstance);
    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.check} ${colors.green}Updated user with invite code${colors.reset}`);

    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.info} ${colors.white}Getting user info...${colors.reset}`);
    const userInfo = await getUserInfo(token, axiosInstance);
    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.success} ${colors.green}Registration complete for ${username}${colors.reset}`);

    const walletData = {
      username,
      publicKey: wallet.publicKey,
      secretKey: wallet.secretKey,
      userId: userInfo.id,
      createdAt: new Date().toISOString()
    };
    saveWallet(walletData);
    console.log(`${colors.cyan}[${index}]${colors.reset} ${emoji.check} ${colors.green}Wallet saved to wallets.json${colors.reset}`);

    return true;
  } catch (error) {
    console.error(`${colors.cyan}[${index}]${colors.reset} ${emoji.error} ${colors.red}Error registering wallet: ${error.message}${colors.reset}`);
    return false;
  }
}

async function main() {
  showBanner();

  try {
    INVITE_CODE = fs.readFileSync('code.txt', 'utf-8').trim();
    console.log(`${emoji.info} ${colors.green}Invite code loaded: ${INVITE_CODE}${colors.reset}`);
  } catch (e) {
    console.log(`${emoji.warning} ${colors.yellow}Invite code file not found, using default code${colors.reset}`);
  }

  let proxies = [];
  try {
    proxies = fs.readFileSync('proxies.txt', 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(parseProxy)
      .filter(proxy => proxy !== null);
    console.log(`${emoji.info} ${colors.green}Loaded ${proxies.length} proxies${colors.reset}`);
  } catch (e) {
    console.log(`${emoji.warning} ${colors.yellow}No proxies file found or empty, continuing without proxies${colors.reset}`);
  }

  const walletCount = parseInt(prompt(`${emoji.info} Enter the number of wallets to create: `));
  if (isNaN(walletCount) || walletCount <= 0) {
    console.error(`${emoji.error} ${colors.red}Please enter a valid number of wallets.${colors.reset}`);
    return;
  }

  console.log(`\n${emoji.rocket} ${colors.green}Creating ${walletCount} wallets with invite code: ${INVITE_CODE}${colors.reset}`);
  let successCount = 0;

  for (let i = 1; i <= walletCount; i++) {
    const success = await createAndRegisterWallet(i, proxies);
    if (success) successCount++;

    if (i < walletCount) {
      console.log(`\n${emoji.wait} ${colors.yellow}Waiting 5 seconds before next wallet...${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n${emoji.success} ${colors.green}Completed! Successfully created ${successCount}/${walletCount} wallets.${colors.reset}`);
  console.log(`${emoji.info} ${colors.white}Wallet data saved to wallets.json${colors.reset}`);
}

main().catch(error => {
  console.error(`${emoji.error} ${colors.red}Fatal error: ${error.message}${colors.reset}`);
});