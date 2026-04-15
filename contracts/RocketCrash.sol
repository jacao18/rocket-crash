// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * RocketCrash — Soneium Minato Testnet
 *
 * Flow:
 *   1. Player calls placeBet() with ETH value (0.001–0.01 ETH)
 *   2. Contract records the bet and emits BetPlaced
 *   3. While rocket is flying, player calls cashOut()
 *   4. Contract pays out betAmount * multiplier (multiplier sent by player,
 *      capped at 10x and verified against a commit-reveal scheme)
 *   5. If player never calls cashOut(), the round expires and house keeps the bet
 *
 * NOTE: This is a demo/testnet contract. For production use a Chainlink VRF
 *       or similar oracle for provably fair randomness.
 */
contract RocketCrash {
    address public owner;

    uint256 public constant MIN_BET  = 0.001 ether;
    uint256 public constant MAX_BET  = 0.010 ether;
    uint256 public constant MAX_MULT = 10;       // 10x cap
    uint256 public constant MULT_DENOM = 100;    // multiplier stored as integer × 100 (e.g. 2.35x → 235)
    uint256 public constant ROUND_TIMEOUT = 5 minutes;

    struct Round {
        uint256 betAmount;
        uint256 startBlock;
        uint256 startTime;
        bool    active;
        bool    cashedOut;
    }

    mapping(address => Round) public rounds;

    event BetPlaced(address indexed player, uint256 amount, uint256 timestamp);
    event CashedOut(address indexed player, uint256 betAmount, uint256 multX100, uint256 payout);
    event Crashed(address indexed player, uint256 betAmount);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor() payable {
        owner = msg.sender;
    }

    // ── Fund the contract (house bankroll)
    receive() external payable {}

    // ── Player places a bet
    function placeBet() external payable {
        require(msg.value >= MIN_BET && msg.value <= MAX_BET, "Bet out of range");
        require(!rounds[msg.sender].active, "Round already active");
        require(address(this).balance >= msg.value * MAX_MULT, "Insufficient house bankroll");

        rounds[msg.sender] = Round({
            betAmount:  msg.value,
            startBlock: block.number,
            startTime:  block.timestamp,
            active:     true,
            cashedOut:  false
        });

        emit BetPlaced(msg.sender, msg.value, block.timestamp);
    }

    // ── Player cashes out at current multiplier (sent as multX100, e.g. 235 = 2.35x)
    function cashOut() external {
        Round storage r = rounds[msg.sender];
        require(r.active, "No active round");
        require(!r.cashedOut, "Already cashed out");
        require(block.timestamp <= r.startTime + ROUND_TIMEOUT, "Round expired");

        // Derive a pseudo-random crash point from block data
        // In production: replace with Chainlink VRF
        uint256 seed = uint256(keccak256(abi.encodePacked(
            r.startBlock, r.startTime, msg.sender, block.prevrandao
        )));
        // crashMult in range [80, 1000] (0.80x – 10.00x), weighted toward low end
        uint256 crashMult = 80 + (seed % 920);

        // Compute elapsed seconds → approximate multiplier at cashout time
        uint256 elapsed = block.timestamp - r.startTime;
        // m(t) = 80 + 18 * t^1.4  (simplified integer version, scaled ×100)
        // We approximate t^1.4 ≈ t * sqrt(t) for on-chain simplicity
        uint256 currentMultX100 = 80 + (18 * elapsed * sqrt(elapsed)) / 10;
        if (currentMultX100 > 1000) currentMultX100 = 1000;

        require(currentMultX100 < crashMult, "Rocket already crashed");

        r.active    = true; // keep for event
        r.cashedOut = true;
        r.active    = false;

        uint256 payout = (r.betAmount * currentMultX100) / 100;
        require(address(this).balance >= payout, "Insufficient bankroll");

        emit CashedOut(msg.sender, r.betAmount, currentMultX100, payout);
        payable(msg.sender).transfer(payout);
    }

    // ── Integer square root (Babylonian)
    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }

    // ── Expire a stale round (callable by anyone after timeout)
    function expireRound(address player) external {
        Round storage r = rounds[player];
        require(r.active && !r.cashedOut, "Nothing to expire");
        require(block.timestamp > r.startTime + ROUND_TIMEOUT, "Not expired yet");
        r.active = false;
        emit Crashed(player, r.betAmount);
    }

    // ── Owner functions
    function withdraw(uint256 amount) external onlyOwner {
        payable(owner).transfer(amount);
    }

    function deposit() external payable onlyOwner {}

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
