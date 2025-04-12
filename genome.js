const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ethers = require('ethers');
const blessed = require('blessed');
const figlet = require('figlet');
const { HttpsProxyAgent } = require('https-proxy-agent');

const COLORS = {
  green: '#00ff00',
  yellow: '#ffff00',
  red: '#ff0000',
  white: '#ffffff',
  gray: '#808080',
  cyan: '#00ffff'
};

const proxies = fs.existsSync('proxies.txt') ?
  fs.readFileSync('proxies.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0) : [];

const screen = blessed.screen({
  smartCSR: true,
  title: 'AIRDROP INSIDERS'
});

let logBox = null;
let statusBox = null;
let inputBox = null;
let menuBox = null;

const log = (message, walletAddress = '', type = 'info') => {
  const timestamp = new Date().toISOString();
  const walletText = walletAddress ? `{${COLORS.yellow}-fg}[${walletAddress.slice(0, 6)}...]{/${COLORS.yellow}-fg} ` : '';
  let formattedMessage;

  switch (type) {
    case 'success':
      formattedMessage = `{${COLORS.green}-fg}[${timestamp}] ${walletText}✓ ${message}{/${COLORS.green}-fg}`;
      break;
    case 'error':
      formattedMessage = `{${COLORS.red}-fg}[${timestamp}] ${walletText}✗ ${message}{/${COLORS.red}-fg}`;
      break;
    case 'warning':
      formattedMessage = `{${COLORS.yellow}-fg}[${timestamp}] ${walletText}⚠ ${message}{/${COLORS.yellow}-fg}`;
      break;
    case 'system':
      formattedMessage = `{${COLORS.white}-fg}[${timestamp}] ${walletText}${message}{/${COLORS.white}-fg}`;
      break;
    case 'muted':
      formattedMessage = `{${COLORS.gray}-fg}[${timestamp}] ${walletText}${message}{/${COLORS.gray}-fg}`;
      break;
    default:
      formattedMessage = `{${COLORS.cyan}-fg}[${timestamp}] ${walletText}ℹ ${message}{/${COLORS.cyan}-fg}`;
  }

  if (logBox && logBox.log) {
    logBox.log(formattedMessage);
    screen.render();
  } else {
    console.log(formattedMessage.replace(/{(\w+)-fg}/g, '').replace(/{\/(\w+)-fg}/g, ''));
  }
};

const updateStatus = (status, wallet = null, color = 'green') => {
  if (statusBox && statusBox.setContent) {
    statusBox.setContent(
      `{${COLORS.white}-fg}Bot Status:{/${COLORS.white}-fg} {${color}-fg}${status}{/${color}-fg}\n` +
      `{${COLORS.white}-fg}Current Wallet:{/${COLORS.white}-fg} {${COLORS.yellow}-fg}${wallet ? wallet.address.slice(0, 6) + '...' : 'N/A'}{/${COLORS.yellow}-fg}`
    );
    screen.render();
  }
};

const generateBannerText = (text, font = 'Standard') => {
  return new Promise((resolve, reject) => {
    figlet.text(text, { font, horizontalLayout: 'default', verticalLayout: 'default' }, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
};

const createUI = async () => {
  let bannerText = 'GENOME BOT';
  const maxWidth = screen.width - 4;
  if (maxWidth >= 70) {
    bannerText = 'GENOME BOT';
  } else if (maxWidth >= 40) {
    bannerText = 'GENOME BOT';
  }

  let asciiBanner;
  try {
    asciiBanner = await generateBannerText(bannerText);
  } catch (err) {
    asciiBanner = bannerText;
    log(`Error generating banner: ${err.message}`, '', 'warning');
  }

  const bannerLines = asciiBanner.split('\n');
  const bannerHeight = bannerLines.length;

  const banner = blessed.box({
    top: 0,
    left: 'center',
    width: '100%',
    height: bannerHeight + 2,
    content: `{${COLORS.cyan}-fg}${asciiBanner}{/${COLORS.cyan}-fg}`,
    align: 'center',
    tags: true,
    border: { type: 'line', fg: COLORS.yellow }
  });

  const noteBox = blessed.box({
    top: bannerHeight + 2,
    left: 'center',
    width: '100%',
    height: 1,
    content: `{${COLORS.white}-fg}Join Us: {${COLORS.cyan}-fg}https://t.me/AirdropInsiderID{/${COLORS.cyan}-fg}{/${COLORS.white}-fg}`,
    align: 'center',
    tags: true
  });

  statusBox = blessed.box({
    top: bannerHeight + 4,
    left: 0,
    width: '100%',
    height: 5,
    content: `{${COLORS.white}-fg}Bot Status:{/${COLORS.white}-fg} {${COLORS.green}-fg}Initializing...{/${COLORS.green}-fg}`,
    tags: true,
    border: { type: 'line', fg: COLORS.yellow }
  });

  logBox = blessed.log({
    top: bannerHeight + 9,
    left: 0,
    width: '100%',
    height: `100%-${bannerHeight + 9}`,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: '┃',
      style: { bg: COLORS.green }
    },
    tags: true,
    border: { type: 'line', fg: COLORS.yellow }
  });

  inputBox = blessed.textbox({
    top: bannerHeight + 4,
    left: 'center',
    width: 40,
    height: 3,
    content: 'Enter number of wallets:',
    inputOnFocus: true,
    border: { type: 'line', fg: COLORS.cyan },
    style: {
      fg: COLORS.white,
      bg: 'black',
      focus: { border: { fg: COLORS.green } }
    }
  });

  menuBox = blessed.list({
    top: bannerHeight + 4,
    left: 'center',
    width: 30,
    height: 6,
    items: ['Start Bot', 'View wallets.json'],
    border: { type: 'line', fg: COLORS.cyan },
    style: {
      fg: COLORS.white,
      bg: 'black',
      selected: { fg: COLORS.cyan },
      item: { fg: COLORS.white }
    },
    keys: true,
    mouse: true,
    itemFormatter: function(item, selected) {
      return selected ? ` ⤷ ${item}` : `   ${item}`;
    }
  });

  screen.append(banner);
  screen.append(noteBox);
  screen.append(statusBox);
  screen.append(logBox);

  return { statusBox, logBox, inputBox, menuBox, bannerHeight };
};

const getRandomProxy = () => {
  if (proxies.length === 0) {
    return { agent: null, address: null };
  }
  const proxy = proxies[Math.floor(Math.random() * proxies.length)];
  let proxyUrl;
  try {
    if (proxy.includes('@')) {
      proxyUrl = `http://${proxy}`;
    } else {
      const parts = proxy.split(':');
      if (parts.length === 4) {
        proxyUrl = `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`;
      } else if (parts.length === 2) {
        proxyUrl = `http://${parts[0]}:${parts[1]}`;
      } else {
        throw new Error('Invalid proxy format');
      }
    }
    return { agent: new HttpsProxyAgent(proxyUrl), address: proxy };
  } catch (err) {
    log(`Invalid proxy format`, '', 'error');
    return { agent: null, address: null };
  }
};

const walletsFilePath = path.join(__dirname, 'wallets.json');
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;

function createWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic.phrase
  };
}

async function signMessage(privateKey, message) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    return await wallet.signMessage(message);
  } catch (err) {
    log(`Error signing message: ${err.message}`, '', 'error');
    throw err;
  }
}

async function signTypedData(privateKey, domain, types, value) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const typesWithoutDomain = { ...types };
    delete typesWithoutDomain.EIP712Domain;
    return await wallet._signTypedData(domain, typesWithoutDomain, value.message);
  } catch (err) {
    log(`Error signing typed data: ${err.message}`, '', 'error');
    throw err;
  }
}

function saveWallets(newWallets) {
  try {
    let existingWallets = [];
    
    if (fs.existsSync(walletsFilePath)) {
      const data = fs.readFileSync(walletsFilePath, 'utf8');
      existingWallets = JSON.parse(data);
    }
    
    const allWallets = [...existingWallets];
    newWallets.forEach(newWallet => {
      const exists = existingWallets.some(w => w.address === newWallet.address);
      if (!exists) {
        allWallets.push(newWallet);
      }
    });
    
    fs.writeFileSync(walletsFilePath, JSON.stringify(allWallets, null, 2));
    log(`Saved ${allWallets.length} wallets to ${walletsFilePath}`, '', 'success');
  } catch (err) {
    log(`Error saving wallets: ${err.message}`, '', 'error');
  }
}

function loadWallets() {
  try {
    if (fs.existsSync(walletsFilePath)) {
      const data = fs.readFileSync(walletsFilePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    log(`Error loading wallets: ${error.message}`, '', 'error');
    return [];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeApiRequest(method, url, data = null, headers = {}, retries = MAX_RETRIES) {
  const proxyInfo = getRandomProxy();
  const proxyAgent = proxyInfo.agent;

  try {
    const config = {
      method,
      url,
      headers,
      validateStatus: status => true,
      httpsAgent: proxyAgent
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);

    if (response.status >= 200 && response.status < 300) {
      return { success: true, data: response.data };
    } else if (response.status >= 500 && retries > 0) {
      log(`Server error (${response.status}), retrying in ${RETRY_DELAY / 1000}s (${retries} left)`, '', 'warning');
      await sleep(RETRY_DELAY);
      return makeApiRequest(method, url, data, headers, retries - 1);
    } else {
      return {
        success: false,
        status: response.status,
        data: response.data,
        message: `Request failed with status ${response.status}`
      };
    }
  } catch (error) {
    if (retries > 0 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('network'))) {
      log(`Network error: ${error.message}, retrying in ${RETRY_DELAY / 1000}s (${retries} left)`, '', 'warning');
      await sleep(RETRY_DELAY);
      return makeApiRequest(method, url, data, headers, retries - 1);
    }
    log(`API request failed: ${error.message}`, '', 'error');
    return {
      success: false,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    };
  }
}

async function registerWallet(wallet, refCode) {
  try {
    log(`Registering wallet`, wallet.address, 'system');
    updateStatus('Registering wallet', wallet);

    const authMessage = `Welcome to Genome!\n\nYou are signing this message to verify ownership of your wallet and establish a secure session. This action will not initiate a blockchain transaction and will not cost any gas fee.`;
    const authSignature = await signMessage(wallet.privateKey, authMessage);
    log(`Signed authentication message`, wallet.address, 'success');

    log(`Logging in to Genome API`, wallet.address);
    const loginResult = await makeApiRequest(
      'POST',
      'https://test.api.zerosum.world/auth/login',
      {
        message: authMessage,
        signature: authSignature
      },
      {
        'accept': '*/*',
        'content-type': 'application/json; charset=utf-8',
        'Referer': 'https://edge.genomeprotocol.com/',
        'sec-ch-ua': '"Brave";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-platform': '"Windows"'
      }
    );

    if (!loginResult.success) {
      throw new Error(`Authentication failed: ${loginResult.message}`);
    }

    const authToken = loginResult.data.token;
    log(`Logged in successfully`, wallet.address, 'success');

    log(`Logging in with RefCode: ${refCode}`, wallet.address);
    const domain = {
      name: "Ref System",
      version: "1"
    };

    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' }
      ],
      Request: [
        { name: 'request', type: 'string' },
        { name: 'nonce', type: 'string' }
      ]
    };

    const nonce = generateRandomNonce();
    const value = {
      primaryType: "Request",
      domain: domain,
      message: {
        request: "LoginWithRefCode",
        nonce: nonce
      },
      types: types
    };

    const refCodeSignature = await signTypedData(wallet.privateKey, domain, types, value);
    const messageBase64 = Buffer.from(JSON.stringify(value)).toString('base64');

    const refHeaders = {
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'Referer': 'https://edge.genomeprotocol.com/',
      'Origin': 'https://edge.genomeprotocol.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Microsoft Edge";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'sec-ch-ua-platform': '"Windows"'
    };

    const refLoginResult = await makeApiRequest(
      'POST',
      'https://dev.refsystem.backend.ent-dx.com/api/v1/LoginWithRefCode',
      {
        refCode: refCode,
        signature: refCodeSignature,
        message: messageBase64,
        projectId: 9
      },
      refHeaders
    );

    if (!refLoginResult.success) {
      log(`RefCode login failed: ${refLoginResult.message}`, wallet.address, 'warning');
    } else {
      log(`Logged in with RefCode`, wallet.address, 'success');
    }

    log(`Setting user as referral`, wallet.address);
    const setRefResult = await makeApiRequest(
      'POST',
      'https://test.api.zerosum.world/users/ref/set-user-as-ref',
      null,
      {
        'accept': '*/*',
        'authorization': `Bearer ${authToken}`,
        'content-type': 'application/json; charset=utf-8',
        'Referer': 'https://edge.genomeprotocol.com/',
        'sec-ch-ua': '"Microsoft Edge";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-platform': '"Windows"'
      }
    );

    if (!setRefResult.success) {
      log(`Could not set user as referral: ${setRefResult.message}`, wallet.address, 'warning');
    } else {
      log(`Set user as referral`, wallet.address, 'success');
    }

    log(`Setting platform rating`, wallet.address);
    const ratingResult = await makeApiRequest(
      'POST',
      'https://test.api.zerosum.world/nexus/set-platform-rating',
      {
        value: 5
      },
      {
        'accept': '*/*',
        'authorization': `Bearer ${authToken}`,
        'content-type': 'application/json; charset=utf-8',
        'Referer': 'https://edge.genomeprotocol.com/',
        'sec-ch-ua': '"Microsoft Edge";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-platform': '"Windows"'
      }
    );

    if (!ratingResult.success) {
      log(`Could not set platform rating: ${ratingResult.message}`, wallet.address, 'warning');
    } else {
      log(`Set platform rating to 5`, wallet.address, 'success');
    }

    log(`Creating RefCode`, wallet.address); 
    const createRefNonce = generateRandomNonce();
    const createRefValue = {
      primaryType: "Request",
      domain: domain,
      message: {
        request: "CreateRefCode",
        nonce: createRefNonce
      },
      types: types
    };

    const createRefSignature = await signTypedData(wallet.privateKey, domain, types, createRefValue);
    const createRefMessageBase64 = Buffer.from(JSON.stringify(createRefValue)).toString('base64');

    const createRefCodeResult = await makeApiRequest(
      'POST',
      'https://dev.refsystem.backend.ent-dx.com/api/v1/CreateRefCode',
      {
        signature: createRefSignature,
        message: createRefMessageBase64,
        projectId: 9
      },
      {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'Referer': 'https://edge.genomeprotocol.com/',
        'Origin': 'https://edge.genomeprotocol.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Microsoft Edge";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-platform': '"Windows"'
      }
    );

    if (!createRefCodeResult.success) {
      log(`Could not create RefCode: ${createRefCodeResult.message}`, wallet.address, 'warning');
    } else {
      log(`Created RefCode`, wallet.address, 'success');
    }

    log(`Claiming quest rewards`, wallet.address);
    const claimResult = await makeApiRequest(
      'POST',
      'https://test.api.zerosum.world/nexus/claim',
      {
        questId: "34"
      },
      {
        'accept': '*/*',
        'authorization': `Bearer ${authToken}`,
        'content-type': 'application/json; charset=utf-8',
        'Referer': 'https://edge.genomeprotocol.com/',
        'sec-ch-ua': '"Microsoft Edge";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-platform': '"Windows"'
      }
    );

    if (!claimResult.success) {
      log(`Could not claim quest reward: ${claimResult.message}`, wallet.address, 'warning');
    } else {
      log(`Claimed quest reward`, wallet.address, 'success');
    }

    return {
      ...wallet,
      registered: true,
      registrationDate: new Date().toISOString(),
      authToken: authToken,
      tasks: {
        auth: true,
        refCodeLogin: refLoginResult.success,
        setRef: setRefResult.success,
        rating: ratingResult.success,
        createRefCode: createRefCodeResult.success,
        claimQuest: claimResult.success
      }
    };
  } catch (error) {
    log(`Error registering wallet: ${error.message}`, wallet.address, 'error');
    if (error.response) {
      log(`Response data: ${JSON.stringify(error.response.data)}`, wallet.address, 'error');
    }
    return {
      ...wallet,
      registered: false,
      error: error.message
    };
  }
}

function generateRandomNonce() {
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

const centerText = (text, width) => {
  const padding = width - text.length;
  const leftPadding = Math.floor(padding / 2);
  const rightPadding = padding - leftPadding;
  return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
};

function showMenu() {
  if (inputBox && inputBox.parent) inputBox.detach();
  if (!menuBox.parent) screen.append(menuBox);
  menuBox.focus();
  updateStatus('Select an option');
  screen.render();
}

async function startBot() {
  menuBox.detach();
  screen.append(inputBox);
  inputBox.focus();
  updateStatus('Enter number of wallets');

  return new Promise((resolve) => {
    inputBox.once('submit', async (value) => {
      inputBox.detach();
      const walletCount = parseInt(value.trim());

      if (isNaN(walletCount) || walletCount <= 0) {
        log('Invalid number entered', '', 'error');
        updateStatus('Invalid input', null, 'red');
        resolve();
        return;
      }

      log(`Processing ${walletCount} wallets`, '', 'system');
      let wallets = [];

      log(`Creating ${walletCount} new wallets`, '', 'system');
      for (let i = 0; i < walletCount; i++) {
        wallets.push(createWallet());
      }

      let refCode;
      try {
        if (fs.existsSync('code.txt')) {
          refCode = fs.readFileSync('code.txt', 'utf-8').trim();
          if (!refCode) {
            log('code.txt is empty', '', 'error');
            updateStatus('No ref code provided', null, 'red');
            resolve();
            return;
          }
        } else {
          log('code.txt not found', '', 'error');
          updateStatus('No ref code provided', null, 'red');
          resolve();
          return;
        }
      } catch (err) {
        log(`Error reading code.txt: ${err.message}`, '', 'error');
        updateStatus('Failed to read ref code', null, 'red');
        resolve();
        return;
      }

      log(`Starting registration for ${walletCount} wallets with refCode: ${refCode}`, '', 'system');

      let registeredWallets = [];

      for (let i = 0; i < walletCount; i++) {
        log(`Processing wallet ${i + 1}/${walletCount}`, wallets[i].address, 'system');
        updateStatus(`Processing wallet ${i + 1}/${walletCount}`, wallets[i]);
        const result = await registerWallet(wallets[i], refCode);
        if (result.registered) {
          registeredWallets.push(result);
          saveWallets(registeredWallets);
        }

        if (i < walletCount - 1) {
          const delay = 5000 + Math.floor(Math.random() * 3000);
          log(`Waiting ${delay / 1000}s before next wallet`, wallets[i].address, 'muted');
          await sleep(delay);
        }
      }

      log('Registration process completed', '', 'success');
      const successCount = registeredWallets.length;
      log(`Successfully registered: ${successCount}/${walletCount}`, '', 'success');
      log(`Failed: ${walletCount - successCount}/${walletCount}`, '', 'warning');

      resolve();
    });

    inputBox.once('cancel', () => {
      log('Input cancelled', '', 'warning');
      inputBox.detach();
      resolve();
    });
  });
}

function viewWallets() {
  menuBox.detach();
  const wallets = loadWallets();
  updateStatus('Viewing wallets.json');

  if (wallets.length === 0) {
    log('No wallets found in wallets.json', '', 'warning');
  } else {
    log(`Found ${wallets.length} registered wallets:`, '', 'system');
    wallets.forEach((wallet, index) => {
      log(`Wallet ${index + 1}: ${wallet.address}`, '', 'info');
      log(`  Registered: ${wallet.registered}`, '', 'info');
      log(`  Date: ${wallet.registrationDate || 'N/A'}`, '', 'info');
      if (wallet.tasks) {
        log(`  Tasks: ${JSON.stringify(wallet.tasks)}`, '', 'info');
      }
    });
  }

  setTimeout(showMenu, 2000); 
}

async function main() {
  try {
    const { statusBox: status, logBox: logBoxInstance, inputBox: input, menuBox: menu } = await createUI();
    statusBox = status;
    logBox = logBoxInstance;
    inputBox = input;
    menuBox = menu;
    logBox.focus();

    screen.key(['escape', 'q', 'C-c'], () => {
      process.exit(0);
    });

    const boxWidth = 49;
    log('╔' + '═'.repeat(boxWidth - 2) + '╗', '', 'system');
    log(`║${centerText('GENOME PROTOCOL BOT INITIALIZED', boxWidth - 2)}║`, '', 'system');
    if (proxies.length > 0) {
      log(`║${centerText('Using proxy', boxWidth - 2)}║`, '', 'system');
    }
    log('╚' + '═'.repeat(boxWidth - 2) + '╝', '', 'system');

    menuBox.on('select', async (item, index) => {
      if (index === 0) { 
        await startBot();
        showMenu();
      } else if (index === 1) { 
        viewWallets();
      }
    });

    showMenu();
  } catch (err) {
    log(`UI initialization failed: ${err.message}`, '', 'error');
    console.error('UI initialization failed:', err);
    process.exit(1);
  }
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, '', 'error');
  console.error('Fatal error:', error);
  process.exit(1);
});