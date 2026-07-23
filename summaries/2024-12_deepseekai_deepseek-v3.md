# DeepSeek-V3 Technical Report

- **Authors:** DeepSeek-AI
- **Venue:** Technical report (arXiv preprint)
- **Year:** 2024
- **Link:** https://arxiv.org/abs/2412.19437
- **Code:** https://github.com/deepseek-ai/DeepSeek-V3

## TL;DR

- DeepSeek-V3 is a **671B**-parameter Mixture-of-Experts LLM that activates only 37B parameters per token [src: Abstract]
  - Trained on 14.8T tokens for ~2.79M H800 GPU-hours [src: Abstract]
  - Frontier quality at a fraction of the usual cost
  - This training cost is roughly one-tenth of what comparable dense frontier models reportedly required
- That efficiency comes from five co-designed innovations spanning the model, the training numerics, and the systems layer
  - FP8 mixed-precision training
  - Fine-grained MoE with auxiliary-loss-free load balancing
  - Multi-head Latent Attention (MLA)
  - Multi-Token Prediction (MTP)
  - The DualPipe parallelism schedule
- This summary is written for our data-science / data-engineering team and dissects each of the five the same way

## How to read this summary

- **Audience:** fellow Data Scientists and Data Engineers
- **Goal:** for each innovation, understand what the field did before and why it hurt, what DeepSeek concretely changed, and what that bought them — not to memorize DeepSeek's hyperparameters
- Each of the five sections below follows the **same five beats**, so they can be compared side-by-side
  - **TL;DR** — one sentence to walk away with
  - **Before — prior SOTA & why it hurt** — the state of the art before this innovation and its concrete technical failure mode
  - **The DeepSeek-V3 fix** — the actual mechanism, *where* it applies, and *why* each design choice was made
  - **What it buys us** — impact, split into **quantitative** (numbers from the paper) and **qualitative** (the capability/property unlocked)
  - **Why a DS/DE should care** — the transferable lesson

---

## 1. FP8 Mixed-Precision Training

- **TL;DR** — Training all the heavy matmuls in 8-bit floating point, made stable at 671B scale by scaling small blocks of numbers instead of whole tensors and accumulating in FP32, holding the loss within 0.25% of BF16 while roughly doubling compute throughput. [src: §3.3]

### Before — prior SOTA & why it hurt

- Frontier LLMs (>100B params) were trained in **BF16**
  - Master weights + optimizer states kept in FP32
  - FP8 had only been shown at small scale — nobody had validated it end-to-end on an extremely large model [src: §1]
- FP8 has a tiny dynamic range
  - **E4M3** (4 exponent / 3 mantissa bits): decent precision, narrow exponent range [src: §3.3.2]
  - **E5M2**: wider range, coarser precision [src: §3.3.2]
  - At >100B scale, activations — and especially gradients — contain outliers
    - Outliers **overflow**: saturate to the format max, destroying the value
    - Or force such a large scale that normal-magnitude values **underflow to zero**
- Tensor-wise scaling is insufficient
  - A single scale factor per whole tensor is dominated by its largest outlier
  - One giant element forces a scale that crushes all normal-magnitude elements into a handful of quantization levels (or to zero) — **the outlier in one position poisons the precision of the entire tensor**
  - The older hybrid recipe (E4M3 forward, E5M2 backward) partially dodged the range problem but sacrificed mantissa precision on backward passes [src: §3.3.2]
- Hardware limit: NVIDIA Hopper Tensor Cores accumulate FP8 matmuls at only ~14-bit internal precision [src: §3.3.2]
  - Over large inner dimensions, that accumulation error alone degrades training loss — independent of how well the inputs are quantized [src: §3.3.2]

### The DeepSeek-V3 fix

- **Selective dtype per location** — not everything runs in FP8 [src: §3.3.1]
  - The three compute-dense GEMMs run in **FP8**, ~doubling compute vs BF16 [src: §3.3.1]
    - **Fprop** (forward)
    - **Dgrad** (activation backward)
    - **Wgrad** (weight backward)
  - Precision-sensitive, low-FLOP components stay in **BF16/FP32** [src: §3.3.1]
    - Embedding, output head, MoE gating, normalization (RMSNorm), attention operators [src: §3.3.1]
    - Rationale: these dominate accuracy sensitivity (gating decisions, softmax, layernorm statistics) but are a tiny fraction of FLOPs, so protecting them is nearly free [src: §3.3.1]
  - Master weights, weight gradients, and optimizer states also stay in higher precision [src: §3.3.1]
- **Fine-grained (block-wise) quantization** — the core outlier fix [src: §3.3.2]
  - Scales are computed per small group instead of per tensor, so an outlier only inflates the scale of its own small group [src: §3.3.2]
    - Activations: **1×128 tiles** (per token, per 128 channels) [src: §3.3.2]
    - Weights: **128×128 blocks** (per 128 input × 128 output channels) [src: §3.3.2]
  - Uses **online quantization** (max-abs computed on-the-fly per tile/block) rather than a rolling historical max [src: §3.3.2]
- **FP32 accumulation promotion** [src: §3.3.2]
  - Partial products are promoted to **FP32 registers on the CUDA cores every N_C = 128 elements** along the inner dimension [src: §3.3.2]
  - Recovers near-FP32 accumulation precision while keeping FP8 Tensor Core throughput [src: §3.3.2]
  - The interval is aligned to the 128 quantization block size so scaling and accumulation compose cleanly [src: §3.3.2]
- **E4M3 everywhere** (not the old hybrid) [src: §3.3.2]
  - Per-tile scaling effectively shares exponent bits within a group, restoring the dynamic range E4M3 lacks [src: §3.3.2]
  - So they keep E4M3's extra mantissa bit on every GEMM [src: §3.3.2]
- **Low-precision storage/comms** [src: §3.3.3]
  - AdamW moments stored in **BF16** [src: §3.3.3]
  - Cached activations stored in **FP8**, halving activation memory [src: §3.3.3]
  - Activations cast to **FP8 before the MoE all-to-all dispatch** to cut cross-node traffic [src: §3.3.3]
  - The **combine** step stays **BF16** to protect the summed expert outputs [src: §3.3.3]
  - Exception: attention-backward activation gradients use a custom **E5M6** format with power-of-two scale factors [src: §3.3.3]

### What it buys us

- **Quantitative**
  - Relative training-loss error vs a BF16 baseline stays **below 0.25%** over ~1T tokens (within run-to-run noise) [src: §3.3, Appendix B.1]
  - FP8 GEMMs: **~2× compute** vs BF16 [src: §3.3.1]
  - FP8 cached activations + BF16 optimizer moments: up to **~2× memory reduction** on those buffers
- **Qualitative**
  - First demonstration that FP8 is **stable end-to-end at frontier (671B MoE) scale** — turns FP8 from a stability liability into a production training recipe [src: §1]
  - Efficient training *and* inference without compromising numerical stability
  - A software precursor to hardware microscaling on NVIDIA Blackwell [src: §3.3.2]

### Why a DS/DE should care

- Precision is not a global switch — it's a **per-location** decision
  - Quantize aggressively where FLOPs live
  - Protect the few numerically sensitive ops
  - Fight outliers with **fine-grained (block-wise) scaling + high-precision accumulation** rather than one scale per tensor
- The same "granularity beats a single global scale" idea applies any time you quantize models for training or inference

---

## 2. Fine-Grained MoE & Expert Load Balancing

- **TL;DR** — Replace big FFNs with 256 small routed experts (+1 shared), activate only 8 per token, and keep them balanced with a learnable per-expert routing bias tuned by a feedback controller instead of an auxiliary loss — getting balance without the quality tax that load-balancing losses normally impose. [src: §2.1.2]

### Before — prior SOTA & why it hurt

- The MoE premise: swap a dense FFN for N expert FFNs + a router that sends each token to top-K experts
  - Decouples *total* params (capacity) from *active* params (per-token FLOPs), so capacity scales cheaply
  - Classic form: GShard/Switch-style top-1/2 routing over a few coarse experts
- Challenge 1 — coarse experts under-specialize
  - Few, large experts each absorb a wide mix of knowledge (poor specialization)
  - Few possible expert *combinations* per token, limiting router expressiveness
  - General knowledge is redundantly duplicated across experts
- Challenge 2 — routing collapse [src: §2.1.2]
  - The router is learned jointly with the LM and has a rich-get-richer dynamic
    - Popular experts get more tokens → more gradient → get better → get picked even more
  - Most experts starve; the extra parameters are wasted
- Challenge 3 — the auxiliary-loss remedy has a real cost [src: §2.1.2]
  - Standard fix: add an **auxiliary load-balancing loss** to push assignments toward uniform [src: §2.1.2]
  - That is an *interference gradient*: it penalizes the routing the LM objective actually wants
  - Enough weight to guarantee balance measurably **degrades model quality** — a direct balance-vs-capability trade-off [src: §2.1.2]
- Challenge 4 — device/communication cost
  - Under expert parallelism (experts sharded across GPUs/nodes), routing is a distributed **all-to-all**
  - If a token's experts are spread across many nodes, cross-node (InfiniBand) traffic explodes and becomes the bottleneck
  - Imbalance causes GPU **stragglers**
  - Under capacity limits, imbalance forces **token dropping** (hurting quality)

### The DeepSeek-V3 fix

- **Config:** 671B total / **37B activated per token** [src: §4.2]
  - 61 layers: first 3 dense, remaining 58 are MoE layers [src: §4.2]
    - Likely rationale (not stated by the paper): early-layer routing tends to be unstable
  - Per MoE layer: **256 routed experts + 1 shared expert**, **8 routed experts activated per token** [src: §4.2]
- **Fine-grained experts + shared-expert isolation** (from DeepSeekMoE) [src: §2.1.2]
  - Splitting into many small experts makes activating 8-of-256 yield combinatorially more expert *combinations* → finer specialization
  - The always-on **shared expert** absorbs common knowledge so routed experts don't each re-learn it
- **Sigmoid affinity router** [src: §2.1.2]
  - Token→expert affinity `s = Sigmoid(uᵀ·eᵢ)` per expert centroid `eᵢ`, then normalize selected gates [src: §2.1.2]
  - Switched from softmax (V2) to **sigmoid** [src: §2.1.2]
    - Likely rationale (not stated by the paper): softmax over 256 experts makes individual gates vanishingly small and gradient-starved
- **Auxiliary-loss-free balancing** (the headline) [src: §2.1.2]
  - Add a **learnable bias bᵢ per expert** to the affinity, used **for top-K selection only** [src: §2.1.2]
    - Routing picks the top-8 of `s + bᵢ` [src: §2.1.2]
    - The **gating weight** multiplying an expert's output still comes from the *original* `s` (no bias) [src: §2.1.2]
  - A **feedback controller** adjusts the bias each step [src: §2.1.2]
    - Overloaded expert → decrease bias by γ [src: §2.1.2]
    - Underloaded expert → increase bias by γ [src: §2.1.2]
  - This steers *which* experts get chosen to fix balance **without injecting a distortion gradient into the LM loss** [src: §2.1.2]
  - Bias update speed **γ = 0.001** for the first 14.3T tokens, then **γ = 0** [src: §4.2]
- **Tiny complementary sequence-wise loss** (weight **α = 0.0001**) [src: §2.1.2, §4.2]
  - Only to rule out pathological imbalance *within a single sequence* [src: §2.1.2]
  - Small enough not to meaningfully perturb the LM objective [src: §4.2]
- **Device-level balance & communication**
  - **Node-limited routing**: each token's 8 experts confined to **≤ 4 nodes**, capping cross-node all-to-all and letting compute/communication overlap [src: §2.1.2]
  - **Expert-to-device allocation** balances per-GPU compute/memory [src: §3.4]
  - At deployment: **redundant experts / dynamic redundancy** duplicate hot experts (e.g. **+32 redundant experts** in prefill EP32) so no single GPU becomes the latency bottleneck [src: §3.4.1]
- **No token dropping** in training or inference — the balance is real, so nothing overflows a capacity limit [src: §2.1.2]

### What it buys us

- **Quantitative**
  - **37B/671B ≈ 5.5%** of params active per token — frontier capacity at a fraction of dense FLOPs [src: Abstract]
  - Ablation (two 16B MoE models, ~1.33T tokens): auxiliary-loss-free beats auxiliary-loss-based on nearly every benchmark, at comparable balance [src: Table 5]
    - BBH: 39.3 vs 37.3 [src: Table 5]
    - GSM8K: 29.6 vs 27.1 [src: Table 5]
    - MMLU: 51.8 vs 51.0 [src: Table 5]
    - Pile-BPB: 0.724 vs 0.727 (lower is better) [src: Table 5]
  - Lineage evidence: DeepSeekMoE-16B outperformed LLaMA2-7B at ~39.6% of its compute
- **Qualitative**
  - Removing the interference gradient **recovers model quality and expert specialization** that auxiliary losses suppress [src: §4.5.2, §4.5.3]
  - Balance is enforced **batch-wise, not per-sequence** — a single-domain sequence isn't forced to spread uniformly, so domain-relevant experts can dominate → clearer, less-redundant specialization [src: §4.5.3]
  - Node-limited routing keeps the distributed system from being communication-bound [src: §2.1.2]

### Why a DS/DE should care

- Two distinct load-balancing problems hide inside "MoE," and they need different tools
  - **Statistical balance across experts** (avoid collapse) — solved here by a *controller-tuned bias*, not a loss
  - **Physical balance across GPUs/nodes** (avoid stragglers & comms blowup) — solved by node-limited routing + expert placement + redundant experts
- The deeper lesson: when a regularization loss fights your main objective, consider moving the constraint *out of the loss* into a control mechanism that doesn't distort gradients

---

## 3. Multi-Head Latent Attention (MLA)

- **TL;DR** — Cache one small compressed latent vector per token instead of full per-head keys and values, shrinking the KV cache ~one-to-two orders of magnitude (V2 reported −93.3%) with no quality loss — the piece that makes long-context inference economical.

### Before — prior SOTA & why it hurt

- Standard Multi-Head Attention (MHA) must **cache** the keys and values of all previous tokens during autoregressive decoding
  - That **KV cache** — not compute — caps the max batch size and context length you can serve, and dominates memory-bandwidth traffic during generation
  - For V3's shape, MHA would cache `2·n_h·d_h = 2·128·128 = 32,768` elements per token per layer, ×61 layers, growing linearly with sequence length [src: §4.2]
- MQA / GQA are the prior compressions, and both trade quality for cache size
  - **Multi-Query Attention (MQA):** shares a single K/V head across all query heads — big cache cut, but measurable quality loss
  - **Grouped-Query Attention (GQA):** interpolates with `n_g` groups
  - Neither recovers full-MHA capacity
- Open problem: cut the KV cache by a large factor **without** the MQA/GQA quality tax

### The DeepSeek-V3 fix

- **Low-rank joint KV compression** — what actually gets cached [src: §2.1.1]
  - Down-project the hidden state to a small latent `c^{KV} = W^{DKV}·h`, with **d_c = 512** (≪ n_h·d_h = 16,384) [src: §2.1.1, §4.2]
  - Keys/values are reconstructed by up-projections `W^{UK}, W^{UV}` only when needed [src: §2.1.1]
  - At inference, **W^{UK} absorbs into the query projection** and **W^{UV} absorbs into the output projection**, so per-head K/V are never materialized in cache
  - **Only the latent is cached** [src: §2.1.1]
- **Decoupled RoPE** — the crucial subtlety [src: §2.1.1]
  - RoPE can't be applied to the compressed keys directly
    - The position-dependent rotation would sit *between* the query and `W^{UK}`, breaking the absorption trick
    - Would force key recomputation for the whole prefix every step
  - Fix: carry position on a small **separate** channel
    - Per-head decoupled query `q^R = RoPE(W^{QR}·c^Q)` [src: §2.1.1]
    - One **shared** decoupled key `k^R = RoPE(W^{KR}·h)` [src: §2.1.1]
    - Both of dim **d_h^R = 64**, concatenated onto the content parts [src: §2.1.1, §4.2]
  - Each attention score = content term (from the latent) + positional term (from the decoupled channel) [src: §2.1.1]
- **Low-rank query compression** (`d_c' = 1536`) [src: §2.1.1, §4.2]
  - Does *not* shrink the cache (queries aren't cached) [src: §2.1.1]
  - Reduces **activation memory during training** [src: §2.1.1]
- **Net cache per token per layer: d_c + d_h^R = 512 + 64 = 576 elements** [src: §2.1.1, §4.2]

### What it buys us

- **Quantitative**
  - **576 vs 32,768** elements per token per layer ≈ **~57× smaller** than equivalently-shaped MHA [src: §4.2]
  - DeepSeek-V2 (same MLA design) reported **KV cache −93.3%** and **max generation throughput ×5.76**
  - This small per-token cache is what makes V3's **128K context** economically serveable
- **Qualitative**
  - Unlike MQA/GQA, MLA does **not** trade quality for compression — reported performance **on par with or better than MHA** [src: §2.1.1]
  - Each head still reads its own slice from the shared latent, preserving per-head diversity [src: §2.1.1]
  - The absorption trick means the compression costs no extra decode-time compute

### Why a DS/DE should care

- The serving bottleneck for long-context LLMs is usually **KV-cache memory bandwidth**, not FLOPs
- MLA shows you can attack it with a **low-rank bottleneck** rather than by throwing away heads (MQA/GQA)
  - But only if you handle position encoding carefully — the decoupled-RoPE trick is the non-obvious part that makes the math actually cache-friendly
- Useful mental model whenever inference memory, not compute, is your limit

---

## 4. Multi-Token Prediction (MTP)

- **TL;DR** — Add a small module that also predicts the 2nd-next token during training (keeping the full causal chain), which densifies the learning signal and improves the main model — then either discard it for zero-cost serving or reuse it as a speculative-decoding draft head for ~1.8× faster inference. [src: §2.2, §5.4.3]

### Before — prior SOTA & why it hurt

- Standard next-single-token prediction: one cross-entropy loss per position
  - Each position gives a single, relatively sparse learning signal
  - The model is never explicitly trained to *look ahead* / pre-plan representations beyond the immediate next token
- Gloeckle et al. (2024) — parallel multi-token prediction [src: §2.2]
  - Predicts D future tokens at each position using **independent parallel heads** [src: §2.2]
  - Densifies the signal, but the heads predict future tokens **independently** [src: §2.2]
  - Breaks the **causal chain** between the extra tokens — each head sees only the shared trunk, not the predicted intermediate tokens [src: §2.2]

### The DeepSeek-V3 fix

- **Sequential MTP modules that preserve the causal chain** [src: §2.2]
  - V3 predicts D additional tokens with **sequential** modules — module k conditions on module k−1's representation [src: §2.2]
  - The complete causal chain is kept at every prediction depth (the explicit contrast with Gloeckle's parallel independent heads) [src: §2.2]
- **Module structure**
  - The k-th MTP module reuses the main model's **shared embedding** and **shared output head** [src: §2.2]
  - Plus its own **Transformer block TRM_k** and a projection `M_k ∈ ℝ^{d×2d}` [src: §2.2]
  - Mechanics: RMSNorms the previous depth's hidden state for token i and the embedding of token i+k, concatenates (dim 2d), projects back to d via M_k, runs TRM_k, and predicts the (k+1)-th future token through the shared head [src: §2.2]
- **Objective**
  - Each depth adds a cross-entropy loss [src: §2.2]
  - Total MTP loss = mean over depths × weight λ, added to the main loss [src: §2.2]
  - Rationale: each position now supplies D+1 supervised predictions instead of 1 (data efficiency), pushing the model to **pre-plan** representations [src: §2.2]
- **Hyperparameters**
  - **D = 1** (predict the 2nd-next token) [src: §4.2]
  - **λ = 0.3** for the first 10T tokens, then **λ = 0.1** for the remaining 4.8T (decayed so the auxiliary objective doesn't over-dominate near convergence) [src: §4.2]
- **Inference: two uses**
  - **Discard** the MTP module — main model works standalone, zero added cost [src: §2.2]
  - Or **repurpose** it as a **speculative-decoding draft head** — it proposes the 2nd-next token and the main model verifies in parallel, with no separate draft network [src: §2.2, §5.4.3]

### What it buys us

- **Quantitative** (ablation, MTP discarded at eval so cost is matched)
  - Consistent gains, largest on reasoning/coding [src: Table 4]
  - Small MoE (15.7B/2.4B, 1.33T tokens): HumanEval 26.8 vs 20.7, GSM8K 31.4 vs 25.4, MMLU 53.3 vs 50.0 [src: Table 4]
  - Large MoE (228.7B/20.9B, 540B tokens): HumanEval 53.7 vs 44.5, DROP 70.6 vs 68.5 — improvement holds as scale increases [src: Table 4]
  - Speculative decoding: 2nd-token **acceptance rate 85–90%**, giving **~1.8× decoding TPS** [src: §5.4.3]
- **Qualitative**
  - MTP densifies supervision and forces representation **pre-planning**, so the trunk improves even after the extra module is thrown away [src: §2.2]
  - The **causal-chain-preserving** design is exactly what makes the same module reusable for speculative decoding — its drafts align with what the main model would generate, hence high acceptance

### Why a DS/DE should care

- One architectural addition yields **two independent wins**
  - A free training-time quality boost (drop it at serving, zero cost)
  - An optional ~1.8× inference speedup
- General lesson: auxiliary training objectives that densify the signal can pay off even when discarded
  - If you preserve the right structure (causal ordering here), a training-time head can be recycled into an inference-time accelerator

---

## 5. DualPipe (Pipeline Parallelism + Compute/Comm Overlap)

- **TL;DR** — A bidirectional pipeline schedule that feeds micro-batches from both ends and finely interleaves compute with the MoE all-to-all, hiding nearly all cross-node communication and roughly halving the pipeline bubble — the piece that keeps a cross-node 671B MoE from being communication-bound. [src: §3.2.1]

### Before — prior SOTA & why it hurt

- Prior pipeline schedules and their bubble sizes
  - **GPipe:** large fill/drain bubble
  - **1F1B:** standard baseline, bubble = `(PP−1)(F+B)` [src: Table 2]
  - **ZB1P / Zero-Bubble:** splits backward into "backward-for-input" B and "backward-for-weights" W to shrink the bubble, bubble = `(PP−1)(F+B−2W)` [src: §3.2.1, Table 2]
  - Bubble grows with pipeline depth PP — deeper pipelines waste more compute idling at fill/drain
- The MoE-specific challenge: cross-node **expert parallelism**
  - Needs an **all-to-all dispatch** (route tokens to experts on other nodes) and **all-to-all combine** (gather results back) per MoE layer [src: §3.2.1]
  - Over InfiniBand this is expensive — the naïve **compute:communication ratio is ~1:1**, i.e. up to *half* the step time could be lost to communication [src: §3.2.1]
  - Fine-grained experts spread across nodes make it worse
  - Communication threatens to become the ceiling on how far MoE can scale

### The DeepSeek-V3 fix

- **Bidirectional schedule** [src: §3.2.1]
  - Feed micro-batches from **both ends of the pipeline simultaneously**, so one direction's forward overlaps the other's backward [src: §3.2.1]
  - Enables both all-to-all *and* pipeline (PP) communication to be **fully hidden** [src: §3.2.1]
- **Fine-grained chunk decomposition for overlap**
  - Each chunk is split into **attention → all-to-all dispatch → MLP → all-to-all combine** [src: §3.2.1]
  - In backward, attention and MLP are further split into backward-for-input / backward-for-weights (à la Zero-Bubble) [src: §3.2.1]
  - These pieces are **manually rearranged** so one micro-batch's compute overlaps another's all-to-all communication, with GPU SMs split between compute and comms tuned so the two costs match [src: §3.2.1]
- **Bubble vs memory trade-off**
  - DualPipe bubble ≈ `(PP/2 − 1)(F&B + B − 3W)` [src: Table 2]
  - The `PP/2−1` factor (vs `PP−1`) roughly **halves** the bubble-inducing stage count [src: Table 2]
  - Cost: **2× parameter copies** — cheap because a large expert-parallelism size means each device only holds a small shard — and activation memory of just PP+1 [src: §3.2.1, Table 2]
- **Efficient all-to-all implementation** so the overlap actually works
  - **Node-limited routing** (≤ 4 nodes/token) caps IB traffic [src: §3.2.2]
  - **Bandwidth-matched routing:** NVLink ≈ 160 GB/s ≈ 3.2× IB's 50 GB/s → ~3.2 experts/node reached over NVLink, so IB and NVLink transfers pipeline into each other [src: §3.2.2]
  - **Minimal SM budget:** only **20 SMs** (10 channels, warp-specialized across dispatch/combine phases) fully saturate both IB and NVLink, leaving the rest of the GPU for the compute the comms hide behind [src: §3.2.2]

### What it buys us

- **Quantitative**
  - Halves the bubble stage-count factor (`PP/2−1` vs `PP−1`) [src: Table 2]
  - Achieves **near-zero all-to-all communication overhead** [src: §3.2.1]
  - Only **20 SMs** needed for communication regardless of scale, so comms don't eat throughput [src: §3.2.2]
- **Qualitative**
  - Turns the MoE's inherent all-to-all tax (which would otherwise ~double step time) into **hidden latency** [src: §3.2.1]
  - As long as the compute:comm ratio stays constant, you can keep adding **fine-grained experts across nodes** without communication becoming the bottleneck — the enabling piece for training a 671B cross-node MoE efficiently [src: §1, §3.2.1]

### Why a DS/DE should care

- At scale, the bottleneck migrates from FLOPs to **data movement** (all-to-all, pipeline bubbles)
- The winning move isn't to reduce communication so much as to **hide it behind computation** via careful scheduling and decomposition
  - And to co-design the routing (node limits, bandwidth matching) so the comms *fit* in the overlap window
- Whenever you build distributed training/serving, ask what's actually idle and whether it can be overlapped rather than eliminated

---

## How the five fit together

- They are complementary layers of one efficiency story
  - **MLA** and **fine-grained MoE** are the **architecture** — cut per-token KV memory and decouple capacity from active FLOPs
  - **FP8** is the **numerics** — halve compute and activation memory without losing stability
  - **DualPipe** is the **systems** layer — hide the all-to-all and pipeline costs that faster FP8 compute would otherwise expose as the new bottleneck
  - **MTP** spans training and inference — a denser training signal that doubles as a speculative-decoding accelerator
- The causal chain across them
  - FP8 makes compute cheap → which exposes communication → which DualPipe hides
  - MoE adds capacity cheaply → but needs two kinds of load balancing → solved by the bias controller + node-limited routing
  - MLA makes the whole thing cheap to *serve*
  - MTP speeds up both training and decoding

## Limitations & Open Questions

- Recommended deployment unit is large (prefill 32 GPUs, decode 320 GPUs) [src: §6, §3.4]
  - Heavy for smaller teams; efficient small-scale serving is an open question [src: §6]
- The FP8 recipe and DualPipe are tightly co-designed with Hopper/H800
  - NVLink+IB bandwidth ratios, SM warp specialization
  - Portability to other accelerators is unclear
- Auxiliary-loss-free balancing introduces a bias-update-speed hyperparameter (γ) and a schedule
  - Sensitivity and general recipes beyond this model are not fully characterized
- MTP is only used with D=1 here
  - Deeper multi-token prediction (D>1) is left as future work

## Personal Takeaways

- The through-line is **co-design**
  - No single trick dominates; each innovation only pays off because the others remove the bottleneck it would otherwise create
  - Good framing for our own systems: optimize the *sequence* of bottlenecks, not one in isolation
- Two ideas transfer beyond LLMs
  - **Granularity beats a single global scale** (block-wise FP8)
  - **Move a constraint out of the loss into a controller** when it fights the main objective (auxiliary-loss-free balancing)
- For serving specifically, the two most directly reusable ideas for our inference stack
  - **MLA** (KV-cache bandwidth)
  - **MTP-as-speculative-decoding**

## Citation

```bibtex
@article{deepseekai2024deepseekv3,
  title   = {DeepSeek-V3 Technical Report},
  author  = {DeepSeek-AI},
  journal = {arXiv preprint arXiv:2412.19437},
  year    = {2024},
  url     = {https://arxiv.org/abs/2412.19437}
}
```
