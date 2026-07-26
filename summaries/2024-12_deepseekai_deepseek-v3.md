# DeepSeek-V3 Technical Report

- **Authors:** DeepSeek-AI
- **Venue:** Technical report (arXiv preprint)
- **Year:** 2024
- **Link:** [https://arxiv.org/abs/2412.19437](https://arxiv.org/abs/2412.19437)
- **Code:** [https://github.com/deepseek-ai/DeepSeek-V3](https://github.com/deepseek-ai/DeepSeek-V3)

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

- **Selective dtype per location** — not everything runs in FP8 [src: §3.3.1] [viz: Fig. 6 — mixed-precision FP8 GEMM framework diagram]
  - The three compute-dense GEMMs run in **FP8**, ~doubling compute vs BF16 [src: §3.3.1]
    - **Fprop** (forward)
    - **Dgrad** (activation backward)
    - **Wgrad** (weight backward)
  - Precision-sensitive, low-FLOP components stay in **BF16/FP32** [src: §3.3.1]
    - Embedding, output head, MoE gating, normalization (RMSNorm), attention operators [src: §3.3.1]
    - Rationale: these dominate accuracy sensitivity (gating decisions, softmax, layernorm statistics) but are a tiny fraction of FLOPs, so protecting them is nearly free [src: §3.3.1]
  - Master weights, weight gradients, and optimizer states also stay in higher precision [src: §3.3.1]
- **Fine-grained (block-wise) quantization** — the core outlier fix [src: §3.3.2] [viz: Fig. 7 — fine-grained tile-and-block quantization diagram]
  - Scales are computed per small group instead of per tensor, so an outlier only inflates the scale of its own small group [src: §3.3.2]
    - Activations: **1×128 tiles** (per token, per 128 channels) [src: §3.3.2]
    - Weights: **128×128 blocks** (per 128 input × 128 output channels) [src: §3.3.2]
  - Uses **online quantization** (max-abs computed on-the-fly per tile/block) [src: §3.3.2]
    - Rather than a rolling historical max [src: §3.3.2] [ref-only]
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
  - The **combine** step stays **BF16** to protect the summed expert outputs [src: §3.3.3] [ref-only]
  - Exception: attention-backward activation gradients use a custom **E5M6** format with power-of-two scale factors [src: §3.3.3] [ref-only]



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
- **Fine-grained experts + shared-expert isolation** (from DeepSeekMoE) [src: §2.1.2] [viz: Fig. 2 — DeepSeekMoE routed + shared-expert structure]
  - Splitting into many small experts makes activating 8-of-256 yield combinatorially more expert *combinations* → finer specialization
  - The always-on **shared expert** absorbs common knowledge so routed experts don't each re-learn it
- **Sigmoid affinity router** [src: §2.1.2]
  - Token→expert affinity `s = Sigmoid(uᵀ·eᵢ)` per expert centroid `eᵢ`, then normalize selected gates [src: §2.1.2]
  - Switched from softmax (V2) to **sigmoid** [src: §2.1.2]
    - Likely rationale (not stated by the paper): softmax over 256 experts makes individual gates vanishingly small and gradient-starved [ref-only]
- **Auxiliary-loss-free balancing** (the headline) [src: §2.1.2] [viz: ext — https://arxiv.org/abs/2408.15664 — Wang et al. bias feedback-control loop (Fig. 1), the method DeepSeek-V3 §2.1.2 cites and adopts]
  - Add a **learnable bias bᵢ per expert** to the affinity, used **for top-K selection only** [src: §2.1.2]
    - Routing picks the top-8 of `s + bᵢ` [src: §2.1.2]
    - The **gating weight** multiplying an expert's output still comes from the *original* `s` (no bias) [src: §2.1.2]
  - A **feedback controller** adjusts the bias each step [src: §2.1.2]
    - Overloaded expert → decrease bias by γ [src: §2.1.2]
    - Underloaded expert → increase bias by γ [src: §2.1.2]
  - This steers *which* experts get chosen to fix balance **without injecting a distortion gradient into the LM loss** [src: §2.1.2]
  - Bias update speed **γ = 0.001** for the first 14.3T tokens, then **γ = 0** [src: §4.2] [ref-only]
- **Tiny complementary sequence-wise loss** (weight **α = 0.0001**) [src: §2.1.2, §4.2] [ref-only]
  - Only to rule out pathological imbalance *within a single sequence* [src: §2.1.2]
  - Small enough not to meaningfully perturb the LM objective [src: §4.2]
- **Device-level balance & communication**
  - **Node-limited routing**: each token's 8 experts confined to **≤ 4 nodes**, capping cross-node all-to-all and letting compute/communication overlap [src: §2.1.2]
  - **Expert-to-device allocation** balances per-GPU compute/memory [src: §3.4] [ref-only]
  - At deployment: **redundant experts / dynamic redundancy** duplicate hot experts (e.g. **+32 redundant experts** in prefill EP32) so no single GPU becomes the latency bottleneck [src: §3.4.1] [ref-only]
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
  - Balance is enforced **batch-wise, not per-sequence** — a single-domain sequence isn't forced to spread uniformly, so domain-relevant experts can dominate → clearer, less-redundant specialization [src: §4.5.3] [viz: Fig. 9 — expert load, aux-loss-free vs aux-loss-based across 3 domains]
  - Node-limited routing keeps the distributed system from being communication-bound [src: §2.1.2]



### Why a DS/DE should care

- Two distinct load-balancing problems hide inside "MoE," and they need different tools
  - **Statistical balance across experts** (avoid collapse) — solved here by a *controller-tuned bias*, not a loss
  - **Physical balance across GPUs/nodes** (avoid stragglers & comms blowup) — solved by node-limited routing + expert placement + redundant experts
- The deeper lesson: when a regularization loss fights your main objective, consider moving the constraint *out of the loss* into a control mechanism that doesn't distort gradients



### Subsequent developments & ecosystem impact

- **DeepEP is the expert-parallel communication library behind node-limited routing** ([deepseek-ai/DeepEP](https://github.com/deepseek-ai/DeepEP), [kernel docs](https://github.com/deepseek-ai/DeepEP/blob/main/docs/legacy.md))
  - An all-to-all dispatch/combine GPU-kernel library (FP8-capable), open-sourced during DeepSeek's Feb-2025 "open-source week," built to carry the token routing decisions the model computes each step
  - **"Normal" kernels serve training and inference-prefill**; **"low-latency" pure-RDMA kernels serve decode** — training and prefill share one kernel family, decode uses a separate one
  - It is the communication substrate for expert parallelism: the balancing strategies themselves — node-limited routing [src: §2.1.2], expert-to-device allocation and redundant experts [src: §3.4] — live in the DeepSeek-V3 design and serving stack, with DeepEP's kernels engineered to carry exactly that traffic pattern efficiently
- **Kimi K2 ran a sparsity scaling-law study to size its expert pool** ([Kimi K2 tech report, arXiv:2507.20534](https://arxiv.org/abs/2507.20534), Fig. 5 & Table 2)
  - Same DeepSeek-V3-style routed+shared MoE, paired with MLA; expanded to **384 routed experts + 1 shared**, 8 activated, 1.04T total / 32.6B activated params (up from V3's 256 routed)
  - A **pre-training sparsity scaling law**: hold activated experts fixed at 8 (constant FLOPs/token) and vary *total* experts, giving sparsity levels 8/16/32/48; higher sparsity consistently lowers loss
  - At a fixed validation loss of 1.5, sparsity-48 needs **1.69× / 1.39× / 1.15× fewer FLOPs** than sparsity 8/16/32 respectively — this result is what motivated K2's 256→384 expert count
- **Routed + shared-expert MoE is the dominant architecture for large models** ([GLM-4.5 report, arXiv:2508.06471](https://arxiv.org/abs/2508.06471); [Llama 4 model card](https://github.com/meta-llama/llama-models/blob/main/models/llama4/MODEL_CARD.md); [cross-model architecture comparison](https://magazine.sebastianraschka.com/p/the-big-llm-architecture-comparison))
  - Fine-grained routed experts plus one always-on shared expert is the default recipe at >100B scale
  - Followers: **DeepSeek-V3/R1** (256+1), **Kimi K2** (384+1), **GLM-4.5 / GLM-4.5-Air / GLM-4.6** (160+1 / 128+1), **Llama 4 Maverick** (128 routed + 1 shared; Llama 4 Scout is smaller, 16 routed + 1 shared), **GLM-5 / GLM-5.2** ([arXiv:2602.15763](https://arxiv.org/html/2602.15763v2); [Zhipu, Feb–June 2026](https://huggingface.co/0xSero/GLM-5.2-504B)) at 256 routed + 1 shared, 8 activated, 744B total / 40B active
  - Below the >100B scale this claim targets, **Gemma 4** ([model card](https://huggingface.co/google/gemma-4-26B-A4B), ~April 2026) also instantiates it: **26B-A4B**, 128 routed + 1 shared, 8 activated, 25.2B total / 3.8B active (Gemma 2/3 remain dense)
  - The pattern strengthened through 2026: **Qwen 3.5** (Qwen3.5-397B-A17B) reintroduced a shared expert (512 routed + 1 shared, top-10) that its predecessor Qwen3-235B-A22B had dropped, and **DeepSeek-V4-Pro** (1.6T total / 49B active, 384 routed + 1 shared) continues it
  - A minority still routes without a shared expert: **Qwen3-235B-A22B** (128 experts, 8 activated, 235B/22B), **MiniMax-01 / MiniMax-M2** (456B/45.9B and 229.9B/9.8B, both no shared expert), **DBRX** (16 experts, 4 activated, 132B/36B)
- **Expert Parallelism is replacing Tensor Parallelism as the primary parameter-sharding axis for vRAM reduction, in both training and inference** ([DeepSeek-V3 report, arXiv:2412.19437](https://arxiv.org/abs/2412.19437), §3.2/§3.4; [DeepSeek scaling-challenges paper, arXiv:2505.09343](https://arxiv.org/abs/2505.09343); [DeepSeek Day-6 inference system overview](https://github.com/deepseek-ai/open-infra-index/blob/main/202502OpenSourceWeek/day_6_one_more_thing_deepseekV3R1_inference_system_overview.md); [LMSYS large-scale EP](https://www.lmsys.org/blog/2025-05-05-large-scale-ep/); [Megatron-Core parallelism guide](https://docs.nvidia.com/megatron-core/developer-guide/0.16.0/user-guide/parallelism-guide.html))
  - Routed-expert FFNs hold the large majority of parameters in a fine-grained MoE — roughly 80–90%, and higher still for the sparsest designs (≈97% for DeepSeek-V3, ≈96% for Qwen3-235B-A22B, computed from public layer configs) — so **EP alone**, sharding only the expert weights and their optimizer state, captures nearly all the vRAM pressure; the small non-expert residue (attention/MLA, embeddings, LM head, dense/shared MLPs) is handled separately by ZeRO/FSDP or DP-attention
  - Three reasons EP has taken over the parameter-sharding role TP used to play:
    1. **Coverage with little regret** — TP shards both attention and MLP matmuls, but with ~90%+ of params concentrated in the experts, EP-only sharding leaves minimal vRAM regret while avoiding TP's costs entirely
    2. **Lighter communication** — TP requires an all-reduce on full activations twice per transformer block, on *every* layer, latency-bound and on the critical path; EP requires only a **per-MoE-layer all-to-all** [src: §3.2.1] dispatching each token's hidden vector to its top-K experts, further cut by node-limited routing [src: §2.1.2] and hidden behind compute via DualPipe overlap. This is a real advantage in these recipes, but it's a co-design result rather than an unconditional property — at very wide EP degrees the all-to-all can itself become the dominant cost, which is exactly why the routing limits and overlap scheduling exist
    3. **Cross-node scaling** — TP's all-reduce collapses in performance over inter-node interconnect, so it stays confined to one NVLink domain (TP≤8); EP's all-to-all scales across many nodes (EP64 spanning 8 nodes in training; EP32→EP320 in inference)
  - Real recipes reflect this: **training** — DeepSeek-V3 uses PP16 (DualPipe) + EP64 + ZeRO-1 DP, with **no TP** [src: §3.2]; Kimi K2 uses PP16 + EP16 (smallest feasible degree) + ZeRO-1, also no TP. **Inference** — wide EP (DeepSeek: EP32 prefill [src: §3.4.1], EP320 decode [src: §3.4.2]; EP144 in the Feb-2025 production system) + DP-attention, with only a small residual TP4 reintroduced on the attention/MLA path in prefill [src: §3.4.1] to protect latency — LMSYS reports up to 3.3× prefill / 5.2× decode throughput versus a TP16 baseline
  - **Scope**: EP replaces TP specifically as the *parameter-sharding* axis — it is combined with, not a replacement for, ZeRO/FSDP (non-expert params + optimizer state) and pipeline parallelism (layer stages); the composite of EP + PP + ZeRO/DP is what supplants the old TP-heavy stack. Connects to Section-2 "Challenge 4" above.

---



## 3. Multi-Head Latent Attention (MLA)

- **TL;DR** — Cache one small compressed latent vector per token instead of full per-head keys and values, shrinking the KV cache ~one-to-two orders of magnitude (V2 reported −93.3%) with no quality loss — the piece that makes long-context inference economical.



### Before — prior SOTA & why it hurt

- Standard Multi-Head Attention (MHA) must **cache** the keys and values of all previous tokens during autoregressive decoding
  - That **KV cache** — not compute — caps the max batch size and context length you can serve, and dominates memory-bandwidth traffic during generation
  - For V3's shape, MHA would cache `2·n_h·d_h = 2·128·128 = 32,768` elements per token per layer [src: §4.2]
    - ×61 layers, growing linearly with sequence length [src: §4.2] [ref-only]
- MQA / GQA are the prior compressions, and both trade quality for cache size
  - **Multi-Query Attention (MQA):** shares a single K/V head across all query heads — big cache cut, but measurable quality loss
  - **Grouped-Query Attention (GQA):** interpolates with `n_g` groups [ref-only]
  - Neither recovers full-MHA capacity
- Open problem: cut the KV cache by a large factor **without** the MQA/GQA quality tax



### The DeepSeek-V3 fix

- **Low-rank joint KV compression** — what actually gets cached [src: §2.1.1] [viz: Fig. 2 (MLA half) — low-rank KV compression + decoupled-RoPE data flow, blue-boxed cached vectors]
  - Down-project the hidden state to a small latent `c^{KV} = W^{DKV}·h`, with **d_c = 512** (≪ n_h·d_h = 16,384) [src: §2.1.1, §4.2]
  - Keys/values are reconstructed by up-projections `W^{UK}, W^{UV}` only when needed [src: §2.1.1]
  - **Only the latent is cached** [src: §2.1.1]
- **The absorption trick — why caching just the latent costs nothing extra**
  - Intuition: instead of unpacking the latent back into full per-head keys for every cached token and dotting each against the query, fold that "unpack" step into the query's own projection once, up front — the query effectively learns to read the compressed latent directly, so per-head keys are never rebuilt. The value side mirrors this: unpacking `W^{UV}` folds into the output projection `W^O` instead of the cache
  - The algebra behind it: the attention score `q_t·k_j = c_t^{Qᵀ}(W^{UQᵀ}W^{UK})c_j^{KV}` — the middle term `W^{UQᵀ}W^{UK}` doesn't depend on the token or its position, so it collapses into a single fixed matrix that's folded in once, ahead of time, instead of being reconstructed per token
  - Payoff: the content-side cache holds only the 512-d latent, and decode does no extra reconstruction compute to use it — this is what makes "cache the latent, not the keys" actually free (the positional side adds one more small piece, covered next)
- **Two computation modes — which form runs when** [viz: ext — https://arxiv.org/abs/2512.02556 — DeepSeek-V3.2 Fig. 7 (App. A): MHA mode (train/prefill) vs MQA mode (decode) of MLA]
  - **Materialize / "MHA mode":** up-project the latent back into full per-head K/V and run standard multi-head attention — used for **training and prefill**, where many tokens are processed at once and the workload is compute-bound, so materializing once and reusing it across the batch is FLOP-efficient
  - **Absorb / "MQA mode":** fold the up-projections into the query/output projections (the absorption trick above) and attend directly on the shared latent, MQA-style — used for **decoding**, where only one new token is processed per step and the workload is memory-bandwidth-bound, so the tiny latent cache is what matters
  - Named and illustrated this way in DeepSeek-V3.2 (arXiv:2512.02556, Appendix A) for V3.1-Terminus; same MLA mechanism V3 uses — the absorption trick above is specifically the decode-time (MQA) form, not a mode MLA runs in unconditionally
- **Decoupled RoPE** — the crucial subtlety [src: §2.1.1]
  - Intuition: RoPE rotates each key by an amount that depends on its position. That rotation would land in the *middle* of the pre-folded absorption matrix above — and because the rotation differs for every token pair, it can't be baked into a single fixed matrix ahead of time. The absorption shortcut falls apart, forcing keys to be rebuilt from the latent at every step, which defeats the point of caching just the latent
  - Fix: don't rotate the compressed content at all — carry position on a small **separate** channel that gets its own rotation [src: §2.1.1]
    - Per-head decoupled query `q^R = RoPE(W^{QR}·c^Q)` [src: §2.1.1]
    - One **shared** decoupled key `k^R = RoPE(W^{KR}·h)` [src: §2.1.1]
    - Both of dim **d_h^R = 64**, concatenated onto the content parts [src: §2.1.1, §4.2]
  - Each attention score = content term (from the latent, absorption-friendly) + positional term (from the decoupled channel) [src: §2.1.1]
- **Low-rank query compression** (`d_c' = 1536`) [src: §2.1.1, §4.2] [ref-only]
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

- **Sequential MTP modules that preserve the causal chain** [src: §2.2] [viz: Fig. 3 — Main Model + sequential MTP Module 1/2 sharing embedding/output head, each with RMSNorm→concatenate→linear-projection→Transformer-block→cross-entropy-loss, causal chain preserved across modules]
  - V3 predicts D additional tokens with **sequential** modules — module k conditions on module k−1's representation [src: §2.2]
  - The complete causal chain is kept at every prediction depth (the explicit contrast with Gloeckle's parallel independent heads) [src: §2.2]
- **Module structure**
  - The k-th MTP module reuses the main model's **shared embedding** and **shared output head** [src: §2.2]
  - Plus its own **Transformer block TRM_k** and a projection `M_k ∈ ℝ^{d×2d}` [src: §2.2]
  - Mechanics: RMSNorms the previous depth's hidden state for token i and the embedding of token i+k, concatenates (dim 2d), projects back to d via M_k, runs TRM_k, and predicts the (k+1)-th future token through the shared head [src: §2.2] [deeper on the module math →](#appendix-mtp-module-internals)
- **Objective**
  - Each depth adds a cross-entropy loss [src: §2.2]
  - Total MTP loss = mean over depths × weight λ, added to the main loss [src: §2.2]
  - Rationale: each position now supplies D+1 supervised predictions instead of 1 (data efficiency), pushing the model to **pre-plan** representations [src: §2.2]
- **Hyperparameters**
  - **D = 1** (predict the 2nd-next token) [src: §4.2]
  - **λ = 0.3** for the first 10T tokens, then **λ = 0.1** for the remaining 4.8T (decayed so the auxiliary objective doesn't over-dominate near convergence) [src: §4.2]
- **Inference: two uses**
  - **Discard** the MTP module — main model works standalone, zero added cost [src: §2.2]
  - Or **repurpose** it as a **speculative-decoding draft head** — it proposes the 2nd-next token and the main model verifies in parallel, with no separate draft network [src: §2.2, §5.4.3] [viz: ext — https://developer.nvidia.com/blog/an-introduction-to-speculative-decoding-for-reducing-latency-in-ai-inference/ — Fig. 1: animated draft-target diagram — draft model proposes several candidate tokens, target model verifies them in one parallel forward pass, accepts the matching prefix] [why speculative decoding is faster →](#appendix-speculative-decoding-throughput-paradox)



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
  - **GPipe:** large fill/drain bubble [ref-only]
  - **1F1B:** standard baseline, bubble = `(PP−1)(F+B)` [src: Table 2]
  - **ZB1P / Zero-Bubble:** splits backward into "backward-for-input" B and "backward-for-weights" W to shrink the bubble, bubble = `(PP−1)(F+B−2W)` [src: §3.2.1, Table 2]
  - Bubble grows with pipeline depth PP — deeper pipelines waste more compute idling at fill/drain [ref-only]
- The MoE-specific challenge: cross-node **expert parallelism**
  - Needs an **all-to-all dispatch** (route tokens to experts on other nodes) and **all-to-all combine** (gather results back) per MoE layer [src: §3.2.1]
  - Over InfiniBand this is expensive — the naïve **compute:communication ratio is ~1:1**, i.e. up to *half* the step time could be lost to communication [src: §3.2.1]
  - Fine-grained experts spread across nodes make it worse
  - Communication threatens to become the ceiling on how far MoE can scale



### The DeepSeek-V3 fix

- **Bidirectional schedule** [src: §3.2.1]
  - Feed micro-batches from **both ends of the pipeline simultaneously**, so one direction's forward overlaps the other's backward — two streams enter from both ends and meet in the middle, each only traversing half the pipeline before overlapping the other stream's work. This halves the effective fill/drain depth from `(PP−1)` to `(PP/2−1)`. [src: §3.2.1]
  - The DualPipe bubble formula reflects this: `((PP/2) − 1)(F&B + B − 3W)` [src: Table 2] — where `F&B` denotes the time of two mutually overlapped forward and backward chunks. The `PP/2−1` factor (vs `PP−1` in 1F1B) is the key — roughly half the bubble-inducing stage count. [viz: Figure 5 — bidirectional DualPipe schedule: 8 PP ranks × 20 micro-batches in two directions; cells sharing a black border have mutually overlapped compute & communication]
  - Enables both all-to-all *and* pipeline (PP) communication to be **fully hidden** [src: §3.2.1]
- **Fine-grained chunk decomposition for overlap**
  - Each chunk is split into **attention → all-to-all dispatch → MLP → all-to-all combine** [src: §3.2.1]
  - In backward, attention and MLP are further split into backward-for-input / backward-for-weights (à la Zero-Bubble) — the "why" below [src: §3.2.1]
  - These pieces are **manually rearranged** so one micro-batch's compute overlaps another's all-to-all communication. The mechanism: a GPU's streaming multiprocessors (SMs) normally all run compute. By dedicating a **small fixed set (20 SMs, §3.2.2)** to run the all-to-all and PP comm kernels *concurrently* with the rest doing attention/MLP compute, comm runs in parallel with (not serially before/after) computation. The SM partition is tuned so the comm kernel finishes within the compute window → comm is fully hidden, costing zero extra step time. [src: §3.2.1 (Figure 4); §3.2.2] [viz: Figure 4 — intra-chunk compute-comm overlap strategy: chunk split into attention / all-to-all dispatch / MLP / all-to-all combine (+ backward B/W split) + PP comm, both all-to-all and PP comm fully hidden (color-coded)]
  - Why split backward into B and W (ZeroBubble): a normal backward computes input-gradients and weight-gradients together as one chunk. But the input-gradient part (**B**) is what propagates downstream to earlier stages (on the critical path), while the weight-gradient part (**W**) only updates local parameters (no downstream dependency, can be deferred). Splitting moves W off the critical path, shrinking the bubble — visible in Table 2 as the `−2W` (ZB1P) and `−3W` (DualPipe) terms. [src: §3.2.1, Table 2]
- **Bubble vs memory trade-off**
  - DualPipe bubble ≈ `(PP/2 − 1)(F&B + B − 3W)` [src: Table 2]
  - The `PP/2−1` factor (vs `PP−1`) roughly **halves** the bubble-inducing stage count [src: Table 2]
  - Cost: **2× parameter copies** — cheap because a large expert-parallelism size means each device only holds a small shard — and activation memory of just PP+1 [src: §3.2.1, Table 2]
- **Efficient all-to-all implementation** so the overlap actually works
  - **Node-limited routing** (≤ 4 nodes/token) caps IB traffic [src: §3.2.2]
  - **Bandwidth-matched routing:** NVLink ≈ 160 GB/s ≈ 3.2× IB's 50 GB/s → ~3.2 experts/node reached over NVLink, so IB and NVLink transfers pipeline into each other [src: §3.2.2] [ref-only]
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



## Appendix

### MTP module internals (Eq. 21–25)

- **Per-depth data flow** [src: §2.2] [viz: Fig. 3 — Main Model + sequential MTP Module 1/2 sharing embedding/output head, each with RMSNorm→concatenate→linear-projection→Transformer-block→cross-entropy-loss, causal chain preserved across modules]
  - For token position i at prediction depth k, combine the (k−1)-th depth representation and the (i+k)-th token embedding via RMSNorm and concatenation [src: §2.2, Eq. 21]
  - Project the 2d concatenated vector back to d using the module-specific matrix `M_k` [src: §2.2, Eq. 21]
  - `h′_i^k = M_k [ RMSNorm(h_i^{k−1}) ; RMSNorm(Emb(t_{i+k})) ]` [src: §2.2, Eq. 21]
  - The combined `h′_i^k` serves as input to the Transformer block `TRM_k` at depth k to produce `h_i^k` [src: §2.2, Eq. 22]
  - `h_{1:T−k}^k = TRM_k( h′_{1:T−k}^k )` [src: §2.2, Eq. 22]
  - Finally, the shared output head computes the probability distribution for the (k+1)-th additional predicted token [src: §2.2, Eq. 23]
  - `P_{i+k+1}^k = OutHead( h_i^k )` [src: §2.2, Eq. 23]
  - When k=1, `h_i^{k−1}` refers to the representation given by the main model (the first MTP module conditions directly on the main model's output) [src: §2.2]
  - Each MTP module shares its embedding layer and output head with the main model [src: §2.2]

- **MTP training objective** [src: §2.2]
  - Each prediction depth computes a cross-entropy loss ℒ_MTP^k over positions 2+k to T+1 [src: §2.2, Eq. 24]
  - `ℒ_MTP^k = CrossEntropy( P_{2+k:T+1}^k , t_{2+k:T+1} ) = −(1/T) Σ_{i=2+k}^{T+1} log P_i^k[t_i]` [src: §2.2, Eq. 24]
  - The overall MTP loss is the average of all per-depth losses, multiplied by weighting factor λ [src: §2.2, Eq. 25]
  - `ℒ_MTP = (λ/D) Σ_{k=1}^{D} ℒ_MTP^k` [src: §2.2, Eq. 25]
  - This serves as an additional training objective for DeepSeek-V3, added to the main loss [src: §2.2]

- **Relation to prior work** [src: §2.2]
  - The principle of maintaining the causal chain is similar to EAGLE (Li et al., 2024b) [src: §2.2]
  - EAGLE's primary objective is speculative decoding, whereas DeepSeek-V3 utilizes MTP primarily to improve training [src: §2.2]



### Why speculative decoding is faster (the throughput paradox)

- **Autoregressive decoding is memory-bandwidth-bound, not compute-bound**
  - At low batch sizes (typical for interactive inference), each step streams the entire model's weights from high-bandwidth memory (HBM) to compute units, then emits a single token [gen-knowledge]
  - The matrix-multiply units spend most of their time waiting for weight data, not doing actual FLOPs — the bottleneck is memory bandwidth, not compute capacity [gen-knowledge]
  - This is why per-token latency doesn't scale with FLOPs alone; the weight-load cost dominates [gen-knowledge]

- **Verifying K candidate tokens costs ≈ the same wall-clock as emitting 1**
  - In speculative decoding, a small draft model proposes K candidate tokens, and the main model verifies all K candidates in a single parallel forward pass [gen-knowledge]
  - The main model still loads its full weight set once, but instead of computing logits for just one position, it computes logits for K positions in parallel [gen-knowledge]
  - The extra FLOPs for K tokens ride on otherwise-idle compute units — they're nearly free because the weight-load latency already dominates [gen-knowledge]
  - So wall-clock time ≈ one main-model step, not K sequential steps [gen-knowledge]

- **Rejection doesn't break correctness**
  - When the main model rejects a draft token, it falls back to generating its own token — the output is identical to plain greedy or sampled decoding [gen-knowledge]
  - Rejected drafts cost extra FLOPs but never compromise correctness; they only waste compute when acceptance is low [gen-knowledge]

- **Resolution of the paradox** [src: §5.4.3]
  - Strictly more total FLOPs (draft + main model) than plain decoding, yet throughput rises whenever acceptance is high [synthesis]
  - The key is converting K sequential, memory-bound main-model steps into 1 parallel step — the memory-bound latency is what mattered, not the FLOP count [synthesis]
  - DeepSeek-V3's MTP module achieves 85–90% token acceptance as a speculative-decoding draft head, yielding ~1.8× decoding TPS [src: §5.4.3] [viz: ext — https://developer.nvidia.com/blog/an-introduction-to-speculative-decoding-for-reducing-latency-in-ai-inference/ — Fig. 1: animated draft-target diagram — draft model proposes several candidate tokens, target model verifies them in one parallel forward pass, accepts the matching prefix]

- **General lesson** [synthesis]
  - When a system is memory-bandwidth-bound, adding FLOPs that execute in parallel with the existing weight-load can be nearly free
  - Speculative decoding exploits this by batching the verification work into the idle compute time that would otherwise be wasted
  - The craft is designing a cheap draft whose proposals align with the main model — hence MTP's causal-chain-preserving design is what makes its drafts reusable at inference

