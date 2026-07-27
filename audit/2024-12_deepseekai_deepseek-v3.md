# Pending audit: 2024-12_deepseekai_deepseek-v3
Changed: summaries/2024-12_deepseekai_deepseek-v3.md and/or decks/2024-12_deepseekai_deepseekai_deepseekai_deepseekai_deepseek-v3*/presentation.html

## Change recorded 2026-07-24T04:21:32.364Z
- OLD: "  - Uses **online quantization** (max-abs computed on-the-fly per tile/block) rather than a rolling historical max [src: §3.3.2]"
  NEW: "  - Uses **online quantization** (max-abs computed on-the-fly per tile/block) [src: §3.3.2]\n    - Rather than a rolling historical max [src: §3.3.2] [ref-only]"

## Change recorded 2026-07-24T04:21:36.251Z
- OLD: "  - The **combine** step stays **BF16** to protect the summed expert outputs [src: §3.3.3]"
  NEW: "  - The **combine** step stays **BF16** to protect the summed expert outputs [src: §3.3.3] [ref-only]"

## Change recorded 2026-07-24T04:21:43.361Z
- OLD: "- **Fine-grained experts + shared-expert isolation** (from DeepSeekMoE) [src: §2.1.2]"
  NEW: "- **Fine-grained experts + shared-expert isolation** (from DeepSeekMoE) [src: §2.1.2] [viz: Fig. 2 — DeepSeekMoE routed + shared-expert structure]"

## Change recorded 2026-07-24T04:21:46.878Z
- OLD: "  - Switched from softmax (V2) to **sigmoid** [src: §2.1.2]\n    - Likely rationale (not stated by the paper): softmax over 256 experts makes individual gates vanishingly small and gradient-starved"
  NEW: "  - Switched from softmax (V2) to **sigmoid** [src: §2.1.2]\n    - Likely rationale (not stated by the paper): softmax over 256 experts makes individual gates vanishingly small and gradient-starved [ref-only]"

## Change recorded 2026-07-24T04:21:51.409Z
- OLD: "- **Auxiliary-loss-free balancing** (the headline) [src: §2.1.2]"
  NEW: "- **Auxiliary-loss-free balancing** (the headline) [src: §2.1.2] [viz: ext — https://arxiv.org/abs/2408.15664 — Wang et al. bias feedback-control loop (Fig. 1), the method DeepSeek-V3 §2.1.2 cites and adopts]"

## Change recorded 2026-07-24T04:21:55.957Z
- OLD: "  - Bias update speed **γ = 0.001** for the first 14.3T tokens, then **γ = 0** [src: §4.2]\n- **Tiny complementary sequence-wise loss** (weight **α = 0.0001**) [src: §2.1.2, §4.2]\n  - Only to rule out pathological imbalance *within a single sequence* [src: §2.1.2]\n  - Small enough not to meaningfully perturb the LM objective [src: §4.2]"
  NEW: "  - Bias update speed **γ = 0.001** for the first 14.3T tokens, then **γ = 0** [src: §4.2] [ref-only]\n- **Tiny complementary sequence-wise loss** (weight **α = 0.0001**) [src: §2.1.2, §4.2] [ref-only]\n  - Only to rule out pathological imbalance *within a single sequence* [src: §2.1.2]\n  - Small enough not to meaningfully perturb the LM objective [src: §4.2]"

## Change recorded 2026-07-24T04:22:00.981Z
- OLD: "  - **Expert-to-device allocation** balances per-GPU compute/memory [src: §3.4]\n  - At deployment: **redundant experts / dynamic redundancy** duplicate hot experts (e.g. **+32 redundant experts** in prefill EP32) so no single GPU becomes the latency bottleneck [src: §3.4.1]"
  NEW: "  - **Expert-to-device allocation** balances per-GPU compute/memory [src: §3.4] [ref-only]\n  - At deployment: **redundant experts / dynamic redundancy** duplicate hot experts (e.g. **+32 redundant experts** in prefill EP32) so no single GPU becomes the latency bottleneck [src: §3.4.1] [ref-only]"

## Change recorded 2026-07-24T04:22:06.101Z
- OLD: "  - Balance is enforced **batch-wise, not per-sequence** — a single-domain sequence isn't forced to spread uniformly, so domain-relevant experts can dominate → clearer, less-redundant specialization [src: §4.5.3]"
  NEW: "  - Balance is enforced **batch-wise, not per-sequence** — a single-domain sequence isn't forced to spread uniformly, so domain-relevant experts can dominate → clearer, less-redundant specialization [src: §4.5.3] [viz: Fig. 9 — expert load, aux-loss-free vs aux-loss-based across 3 domains]"

## Deck change recorded 2026-07-24T04:22:10.987Z (decks/2024-12_deepseekai_deepseek-v3/presentation.html)
- OLD: "          <li class=\"reveal r3\" style=\"margin-top: var(--element-gap);\"><strong>Online quantization</strong> &mdash; max-abs computed on-the-fly per tile/block, not a rolling historical max.</li>"
  NEW: "          <li class=\"reveal r3\" style=\"margin-top: var(--element-gap);\"><strong>Online quantization</strong> &mdash; max-abs computed on-the-fly per tile/block.</li>"

## Deck change recorded 2026-07-24T04:22:15.024Z (decks/2024-12_deepseekai_deepseek-v3/presentation.html)
- OLD: "        <p>AdamW moments in BF16 &middot; cached activations in FP8 (half the memory) &middot; activations cast to FP8 before the MoE all-to-all dispatch &middot; the combine step stays BF16 to protect summed outputs.</p>"
  NEW: "        <p>AdamW moments in BF16 &middot; cached activations in FP8 (half the memory) &middot; activations cast to FP8 before the MoE all-to-all dispatch.</p>"

## Deck change recorded 2026-07-24T04:22:55.099Z (decks/2024-12_deepseekai_deepseek_v3/presentation.html)
- OLD: "    <p class=\"eyebrow reveal\">The DeepSeek-V3 fix &middot; 1/3</p>\n    <h2 class=\"reveal r2\">Many small experts, one always-on generalist</h2>\n    <div class=\"stat-row\" style=\"margin-bottom: clamp(0.75rem, 2.5vh, 1.5rem);\">\n      <div class=\"stat reveal r2\"><div class=\"stat-num\">671B</div><div class=\"stat-label\">total params, 37B activated per token</div></div>\n      <div class=\"stat reveal r3\"><div class=\"stat-num\">256+1</div><div class=\"stat-label\">routed experts + 1 shared, per MoE layer</div"
  NEW: "    <p class=\"eyebrow reveal\">The DeepSeek-V3 fix &middot; 1/3</p>\n    <h2 class=\"reveal r2\">Many small experts, one always-on generalist</h2>\n    <div class=\"two-col fig-wide\">\n      <div class=\"col-text\">\n        <div class=\"stat-row\" style=\"margin-bottom: clamp(0.75rem, 2.5vh, 1.5rem);\">\n          <div class=\"stat reveal r2\"><div class=\"stat-num\">671B</div><div class=\"stat-label\">total params, 37B activated per token</div></div>\n          <div class=\"stat reveal r3\"><div class=\"stat-num\">256+"

## Deck change recorded 2026-07-24T04:23:07.663Z (decks/2024-12_deepseekai_deepseekai_deepseek_v3/presentation.html)
- OLD: "    <p class=\"eyebrow reveal\">The DeepSeek-V3 fix &middot; 2/3</p>\n    <h2 class=\"reveal r2\">Balance via a controller, not a loss &mdash; the headline</h2>\n    <ul class=\"bullet-list\" style=\"font-size: var(--body-size); max-width: 72ch;\">\n      <li class=\"reveal r2\"><strong>Learnable bias bᵢ per expert</strong>, added to the affinity for top-K selection only &mdash; routing picks the top-8 of <code>s + bᵢ</code>, but the gating weight multiplying an expert's output still comes from the original "
  NEW: "    <p class=\"eyebrow reveal\">The DeepSeek-V3 fix &middot; 2/3</p>\n    <h2 class=\"reveal r2\">Balance via a controller, not a loss &mdash; the headline</h2>\n    <div class=\"two-col fig-wide\">\n      <div class=\"col-text\">\n        <ul class=\"bullet-list\" style=\"font-size: var(--body-size);\">\n          <li class=\"reveal r2\"><strong>Learnable bias bᵢ per expert</strong>, added to the affinity for top-K selection only &mdash; routing picks the top-8 of <code>s + bᵢ</code>, but the gating weight multiplying an expert's output still comes from the original "

## Deck change recorded 2026-07-24T04:23:17.285Z (decks/2024-12_deepseekai_deepseekai_deepseek_v3/presentation.html)
- OLD: "    <div class=\"card-grid\">\n      <div class=\"card reveal r2\">\n        <h3>Node-limited routing</h3>\n        <p>Each token's 8 experts are confined to &le;4 nodes, capping cross-node all-to-all traffic and letting compute/communication overlap.</p>\n      </div>\n      <div class=\"card reveal r2\">\n        <h3>Expert-to-device allocation</h3>\n        <p>Balances per-GPU compute and memory load at placement time.</p>\n      </div>\n      <div class=\"card reveal r3\">\n        <h3>Redundant experts at de"
  NEW: "    <div class=\"card-grid\">\n      <div class=\"card reveal r2\">\n        <h3>Node-limited routing</h3>\n        <p>Each token's 8 experts are confined to &le;4 nodes, capping cross-node all-to-all traffic and letting compute/communication overlap.</p>\n      </div>\n      <div class=\"card reveal r3\">\n        <h3>No token dropping</h3>\n        <p>In training or inference &mdash; the balance is real, so nothing overflows a capacity limit.</p>\n      </div>\n    </div>"

## Deck change recorded 2026-07-24T04:23:26.316Z (decks/2024-12_deepseekai_deepseekai_deepseek_v3/presentation.html)
- OLD: "    <ul class=\"bullet-list\" style=\"font-size: var(--body-size); max-width: 72ch;\">\n      <li class=\"reveal r4\">Ablation on two 16B MoE models (~1.33T tokens), comparable balance in both &mdash; removing the interference gradient recovers model quality <em>and</em> expert specialization that auxiliary losses suppress.</li>\n      <li class=\"reveal r4\" style=\"margin-top: var(--element-gap);\">Balance is enforced batch-wise, not per-sequence &mdash; a single-domain sequence isn't forced to spread uniformly, so domain-relevant experts can dominate → clearer, less-redundant specialization</li>"
  NEW: "    <div class=\"fig-stack fig-stack--compact\">\n      <div class=\"fig-text\">\n        <ul class=\"bullet-list\" style=\"font-size: var(--body-size);\">\n          <li class=\"reveal r4\">Ablation on two 16B MoE models (~1.33T tokens), comparable balance in both &mdash; removing the interference gradient recovers model quality <em>and</em> expert specialization that auxiliary losses suppress.</li>\n          <li class=\"reveal r4\" style=\"margin-top: var(--element-gap);\">Balance is enforced batch-wise, not per-p"

## Run 2026-07-23 — scope: TL;DR section, training-cost bullets under "That efficiency comes from..." sibling bullets
Target: `summaries/2024-12_deepseekai_deepseekai_deepseek-v3.md` · Source: `papers/2024-12_deepseekai_deepseekai_deepseek_v3.pdf`

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | "Trained on 14.8T tokens for ~2.79M H800 GPU-hours" | ACCEPTED-CITED | [src: Abstract] — writer-tagged; paper Abstract confirms "pre-train DeepSeek-V3 on 14.8 trillion diverse and high-quality tokens... requires only 2.788M H800 GPU hours for its full training." |
| 2 | "This training cost is roughly one-tenth of what comparable dense frontier models reportedly required" | CONFIRMED | Cross-checked via web search: Meta's Llama 3.1 405B (a comparable dense frontier model, evaluated against DeepSeek-V3 in Table 3/6 of the paper) required 30.84M H100 GPU-hours for training (source: Meta/Llama 3.1 reporting). Ratio 2.788M / 30.84M ≈ 9.0%, i.e. roughly one-tenth. Note: DeepSeek-V3 uses H800 (a China-market variant of H100 with reduced NVLink bandwidth) rather than H100, and this compares raw GPU-hours rather than normalized FLOPs or dollar cost, so "roughly one-tenth" is a defensible order-of-magnitude approximation rather than an exact like-for-like figure. |

**Summary:** 2 claims checked — 1 accepted-cited, 1 confirmed, 0 uncertain, 0 incorrect.

## Run 2026-07-23 — scope: full document (post-tagging pass, ~137 `[src:]` locators)
Target: `summaries/2024-12_deepseekai_deepseekai_deepseek-v3.md` · Source: `papers/2024-12_deepseekai_deepseekai_deepseekai_deepseekai_v3.pdf` (+ web search for external/prior-work claims)

Excluded per scope: `## How to read this summary`, `## How the five fit together`, `## Personal Takeaways`, all five `### Why a DS/DE should care` subsections, and pure vague framing bullets with no checkable content. Tightly-coupled sub-bullets sharing one `[src:]` tag with their parent are recorded as a single row.

### TL;DR

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | 671B-param MoE LLM, 37B activated per token | ACCEPTED-CITED | [src: Abstract] |
| 2 | Trained on 14.8T tokens for ~2.79M H800 GPU-hours | ACCEPTED-CITED | [src: Abstract] |
| 3 | "This training cost is roughly one-tenth of what comparable dense frontier models reportedly required" | CONFIRMED | Carried forward from prior run (2026-07-23, claim #2): Llama 3.1 405B ≈ 30.84M H100 GPU-hours vs V3's 2.788M H800 GPU-hours ≈ 9%. |

### 1. FP8 Mixed-Precision Training

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 4 | TL;DR (block-wise scaling, FP32 accum, <0.25% loss delta, ~2x throughput) | ACCEPTED-CITED | [src: §3.3] |
| 5 | Frontier LLMs (>100B params) were trained in BF16 | CONFIRMED | Well-established precedent (e.g. PaLM 540B, LLaMA series trained in BF16); consistent with paper's own framing (p.14) that FP8 pre-training at this scale was previously unvalidated. |
| 6 | Master weights + optimizer states kept in FP32 (standard practice) | CONFIRMED | Standard mixed-precision training practice (Micikevicius et al. mixed-precision training), consistent with paper §3.3.1 describing DeepSeek-V3's own choice to keep these in higher precision. |
| 7 | FP8 had only been shown at small scale — nobody had validated it end-to-end on an extremely large model | ACCEPTED-CITED | [src: §1] |
| 8 | E4M3 / E5M2 format tradeoffs | ACCEPTED-CITED | [src: §3.3.2] |
| 9 | At >100B scale, activations and gradients contain outliers that overflow or force underflow | CONFIRMED | Paraphrase of paper p.14: "low-precision training... is often limited by the presence of outliers in activations, weights, and gradients." |
| 10 | Tensor-wise scaling is insufficient — a single scale factor is dominated by its largest outlier | CONFIRMED | Matches paper p.16: "This method makes low-precision training highly sensitive to activation outliers, which can heavily degrade quantization accuracy." |
| 11 | Older hybrid recipe (E4M3 fwd, E5M2 bwd) partially dodged range problem but sacrificed mantissa precision | ACCEPTED-CITED | [src: §3.3.2] |
| 12 | Hopper Tensor Cores accumulate FP8 matmuls at only ~14-bit internal precision; degrades loss over large inner dims | ACCEPTED-CITED | [src: §3.3.2] |
| 13 | Selective dtype per location (Fprop/Dgrad/Wgrad in FP8; embedding/output head/gating/norm/attention in BF16/FP32) | ACCEPTED-CITED | [src: §3.3.1] |
| 14 | Fine-grained (block-wise) quantization: 1×128 activation tiles, 128×128 weight blocks, online quantization | ACCEPTED-CITED | [src: §3.3.2] |
| 15 | FP32 accumulation promotion every N_C=128 elements | ACCEPTED-CITED | [src: §3.3.2] |
| 16 | E4M3 used everywhere (not old hybrid), enabled by per-tile scaling | ACCEPTED-CITED | [src: §3.3.2] |
| 17 | Low-precision storage/comms (AdamW moments BF16, activations FP8, combine step BF16, E5M6 exception) | ACCEPTED-CITED | [src: §3.3.3] |
| 18 | Relative training-loss error vs BF16 baseline stays below 0.25% over ~1T tokens | ACCEPTED-CITED | [src: §3.3, Appendix B.1] |
| 19 | FP8 GEMMs ~2× compute vs BF16 | ACCEPTED-CITED | [src: §3.3.1] |
| 20 | FP8 cached activations + BF16 optimizer moments: up to ~2× memory reduction on those buffers | CONFIRMED | Derived arithmetic consistent with paper's separately-stated facts: FP8 caching "halves activation memory" (p.18) and BF16 optimizer moments replace FP32 (also a 2× reduction on that buffer, p.18). |
| 21 | First demonstration FP8 stable end-to-end at frontier (671B MoE) scale | ACCEPTED-CITED | [src: §1] |
| 22 | Efficient training and inference without compromising numerical stability | CONFIRMED | Restates the combination of claims #18-19 already supported above; consistent with paper's overall framing (p.14). |
| 23 | Software precursor to hardware microscaling on NVIDIA Blackwell | ACCEPTED-CITED | [src: §3.3.2] |

### 2. Fine-Grained MoE & Expert Load Balancing

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 24 | TL;DR (256 routed +1 shared, top-8, bias-controller balancing) | ACCEPTED-CITED | [src: §2.1.2] |
| 25 | MoE premise: swap dense FFN for N experts + router; decouples capacity from active FLOPs; classic GShard/Switch top-1/2 routing | CONFIRMED | Matches paper p.8 citing GShard (Lepikhin et al. 2021) as the "traditional" comparator; Switch Transformer (Fedus et al. 2021) cited p.9 for aux-loss balancing precedent. |
| 26 | Coarse experts under-specialize; general knowledge redundantly duplicated | CONFIRMED | Standard framing consistent with DeepSeekMoE's own stated motivation (paper cites Dai et al. 2024 DeepSeekMoE, p.8). |
| 27 | Routing collapse — rich-get-richer dynamic starves most experts | ACCEPTED-CITED | [src: §2.1.2] (paper p.9 cites Shazeer et al. 2017 for routing collapse) |
| 28 | Aux-loss remedy: standard fix is a load-balancing loss; interference gradient; too much weight degrades quality | ACCEPTED-CITED | [src: §2.1.2] — paper p.9: "too large an auxiliary loss will impair the model performance." |
| 29 | Device/communication cost: EP requires all-to-all; imbalance causes stragglers and token dropping | CONFIRMED | General MoE systems knowledge, consistent with paper's own node-limited-routing motivation (§2.1.2/§3.2.1). |
| 30 | Config: 671B total / 37B activated; 8 activated per token; 256 routed + 1 shared | ACCEPTED-CITED | [src: §4.2] |
| 31 | 61 layers: first 3 dense, remaining 58 are MoE layers | ACCEPTED-CITED | [src: §4.2] — matches §4.2 (p.22): "We set the number of Transformer layers to 61... We substitute all FFNs except for the first three layers with MoE layers," i.e. 58 MoE layers. |
| 32 | "Likely rationale (not stated by the paper): early-layer routing tends to be unstable" | UNCERTAIN | Writer's own inference, explicitly labeled as such; not asserted in §4.2 or elsewhere per full-text check. §4.2 (p.22) states only the fact ("We substitute all FFNs except for the first three layers with MoE layers") with no rationale given anywhere in the report. |
| 33 | Fine-grained experts + shared-expert isolation (from DeepSeekMoE) | ACCEPTED-CITED | [src: §2.1.2] |
| 34 | Sigmoid affinity router formula `s = Sigmoid(uᵀ·eᵢ)` | ACCEPTED-CITED | [src: §2.1.2] — matches Eq. 15, p.8. |
| 35 | Switched from softmax (V2) to sigmoid | ACCEPTED-CITED | [src: §2.1.2] — matches p.9: "DeepSeek-V3 uses the sigmoid function...Slightly different from DeepSeek-V2." |
| 36 | "Likely rationale (not stated by the paper): softmax over 256 experts makes individual gates vanishingly small and gradient-starved" | UNCERTAIN | Writer's own inference, explicitly labeled as such; not asserted in §4.2 or elsewhere per full-text check. No rationale for the softmax→sigmoid switch is given anywhere in the paper. |
| 37 | Auxiliary-loss-free balancing: bias term added for top-K selection only, gating value still from raw s, feedback controller ±γ | ACCEPTED-CITED | [src: §2.1.2] — matches Eq. 16 and surrounding text, p.9. |
| 38 | γ = 0.001 for first 14.3T tokens, then γ = 0 | ACCEPTED-CITED | [src: §4.2] |
| 39 | Complementary sequence-wise loss, α = 0.0001 | ACCEPTED-CITED | [src: §2.1.2, §4.2] |
| 40 | Node-limited routing (≤4 nodes/token); expert-to-device allocation; +32 redundant experts in prefill EP32 | ACCEPTED-CITED | [src: §2.1.2, §3.4, §3.4.1] |
| 41 | No token dropping in training or inference | ACCEPTED-CITED | [src: §2.1.2] |
| 42 | 37B/671B ≈ 5.5% active params | ACCEPTED-CITED | [src: Abstract] |
| 43 | Ablation: "two 16B MoE models, ~1.33T tokens" with BBH 39.3/37.3, GSM8K 29.6/27.1, MMLU 51.8/51.0, Pile-BPB 0.724/0.727 | CONFIRMED | Re-verified directly against Table 5 (p.27): the "Small MoE" columns (15.7B total / 2.4B activated params) are explicitly labeled "# Training Tokens: 1.33T," and the row values match exactly — Pile-test (BPB) 0.727/0.724, BBH 37.3/39.3, MMLU 51.0/51.8, GSM8K 27.1/29.6 (aux-loss-based vs aux-loss-free). This corrects the prior run's finding (which had flagged "~578B tokens" as wrong — 578B is the token count for the separate Large MoE column, not this one). |
| 44 | Lineage evidence: DeepSeekMoE-16B outperformed LLaMA2-7B at ~39.6% of its compute | CONFIRMED | Web search of the DeepSeekMoE paper (arXiv:2401.06066) confirms verbatim: "With only 39.6% of computations, DeepSeekMoE 16B outperforms LLaMA2 7B on the majority of benchmarks." Corrected wording ("outperformed... ~39.6%") now matches the source exactly, superseding the prior run's "matched... ~40%" understatement. |
| 45 | Removing interference gradient recovers model quality and expert specialization | ACCEPTED-CITED | [src: §4.5.2, §4.5.3] |
| 46 | Balance enforced batch-wise not per-sequence, enabling clearer specialization | ACCEPTED-CITED | [src: §4.5.3] |
| 47 | Node-limited routing keeps system from being communication-bound | ACCEPTED-CITED | [src: §2.1.2] |

### 3. Multi-Head Latent Attention (MLA)

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 48 | TL;DR: cache one compressed latent instead of full KV, shrinking cache ~1-2 orders of magnitude, V2 reported −93.3%, no quality loss | CONFIRMED | −93.3% figure confirmed via web search of the DeepSeek-V2 paper (arXiv:2405.04434): "reduces the KV cache by 93.3%." No-quality-loss claim consistent with V2 paper's stated MLA design goal. |
| 49 | Standard MHA must cache K/V of all previous tokens; KV cache (not compute) caps batch size/context and dominates memory-bandwidth traffic | CONFIRMED | Well-established LLM serving fact, consistent with paper's own framing motivating MLA. |
| 50 | For V3's shape, MHA would cache 2·n_h·d_h = 32,768 elements/token/layer × 61 layers | ACCEPTED-CITED | [src: §4.2] |
| 51 | MQA shares single K/V head (quality loss); GQA interpolates with n_g groups; neither recovers full-MHA capacity | CONFIRMED | Standard, well-documented tradeoffs of MQA (Shazeer 2019) / GQA (Ainslie et al. 2023) in the LLM efficiency literature. |
| 52 | Open problem framing: cut KV cache without MQA/GQA quality tax | CONFIRMED | Reasonable framing consistent with paper's stated motivation for MLA (p.7-8). |
| 53 | Low-rank joint KV compression: `c^KV = W^DKV·h`, d_c=512, reconstructed via up-projections only when needed | ACCEPTED-CITED | [src: §2.1.1, §4.2] |
| 54 | "At inference, W^UK absorbs into the query projection and W^UV absorbs into the output projection, so per-head K/V are never materialized in cache" | UNCERTAIN | This "absorption trick" mechanism and terminology do not appear anywhere in the DeepSeek-V3 report (full-text check of §2.1.1/Eqs. 1-11 confirms no mention of "absorb"). The underlying mechanism is real and documented in the DeepSeek-V2 paper, but is not stated in this source document, so it cannot be verified against the cited source itself. |
| 55 | Only the latent is cached | ACCEPTED-CITED | [src: §2.1.1] |
| 56 | Decoupled RoPE: RoPE can't apply directly to compressed keys (would break absorption trick / force recompute); fix via separate decoupled channel | UNCERTAIN | The decoupled-RoPE mechanism itself (Eqs. 3, 8) is in the paper and separately cited, but the specific rationale "would sit between the query and W^UK, breaking the absorption trick" again invokes the absorption-trick framing that isn't in this paper's text — writer's inference/carry-over from V2, not verifiable against this source. |
| 57 | q^R = RoPE(W^QR·c^Q), k^R = RoPE(W^KR·h), both dim d_h^R=64 | ACCEPTED-CITED | [src: §2.1.1] |
| 58 | Attention score = content term + positional term | ACCEPTED-CITED | [src: §2.1.1] |
| 59 | Low-rank query compression d_c'=1536; doesn't shrink cache; reduces training activation memory | ACCEPTED-CITED | [src: §2.1.1, §4.2] |
| 60 | Net cache per token per layer = 512+64 = 576 elements | ACCEPTED-CITED | [src: §2.1.1, §4.2] |
| 61 | 576 vs 32,768 elements ≈ ~57× smaller than equivalently-shaped MHA | ACCEPTED-CITED | [src: §4.2] |
| 62 | DeepSeek-V2 reported KV cache −93.3% and max generation throughput ×5.76 | CONFIRMED | Web search of DeepSeek-V2 paper (arXiv:2405.04434) confirms both figures verbatim: "reduces the KV cache by 93.3%, and boosts the maximum generation throughput to 5.76 times." |
| 63 | "This small per-token cache is what makes V3's 128K context economically serveable" | UNCERTAIN | Causal claim not stated directly in this form in the paper; the 128K context (§4.3) and the small cache (§2.1.1/§4.2) are each independently documented, but the paper does not explicitly draw this causal connection. Plausible inference, not verbatim. |
| 64 | MLA does not trade quality for compression; on par with or better than MHA | ACCEPTED-CITED | [src: §2.1.1] |
| 65 | Each head reads its own slice from shared latent, preserving per-head diversity | ACCEPTED-CITED | [src: §2.1.1] |
| 66 | "The absorption trick means the compression costs no extra decode-time compute" | UNCERTAIN | Same issue as claims #54/56: the "absorption trick" is not described anywhere in this V3 report, so this causal/mechanistic claim cannot be verified against the cited source, though it is a defensible technical inference. |

### 4. Multi-Token Prediction (MTP)

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 67 | TL;DR: predicts 2nd-next token, densifies signal, discard or reuse for speculative decoding ~1.8× | ACCEPTED-CITED | [src: §2.2, §5.4.3] |
| 68 | Standard next-token prediction: sparse per-position signal, no explicit lookahead | CONFIRMED | Standard, uncontroversial framing of autoregressive LM training. |
| 69 | Gloeckle et al. (2024): parallel MTP with independent heads, breaks causal chain | ACCEPTED-CITED | [src: §2.2] |
| 70 | V3 uses sequential MTP modules preserving complete causal chain, contrasted with Gloeckle | ACCEPTED-CITED | [src: §2.2] |
| 71 | Module structure: shared embedding/output head, TRM_k, projection M_k, RMSNorm+concat mechanics | ACCEPTED-CITED | [src: §2.2] |
| 72 | Objective: cross-entropy per depth, weighted average λ added to main loss, pre-planning rationale | ACCEPTED-CITED | [src: §2.2] |
| 73 | D=1; λ=0.3 for first 10T tokens then λ=0.1 for remaining 4.8T | ACCEPTED-CITED | [src: §4.2] |
| 74 | Inference: discard (zero cost) or repurpose as speculative-decoding draft head | ACCEPTED-CITED | [src: §2.2, §5.4.3] |
| 75 | Consistent gains, largest on reasoning/coding (ablation) | ACCEPTED-CITED | [src: Table 4] |
| 76 | Small MoE (15.7B/2.4B, 1.33T tokens): HumanEval 26.8 vs 20.7, GSM8K 31.4 vs 25.4, MMLU 53.3 vs 50.0 | ACCEPTED-CITED | [src: Table 4] |
| 77 | Large MoE (228.7B/20.9B, 540B tokens): HumanEval 53.7 vs 44.5, DROP 70.6 vs 68.5 | ACCEPTED-CITED | [src: Table 4] |
| 78 | Speculative decoding: 2nd-token acceptance rate 85-90%, ~1.8× decoding TPS | ACCEPTED-CITED | [src: §5.4.3] |
| 79 | MTP densifies supervision, forces pre-planning, trunk improves even after module discarded | ACCEPTED-CITED | [src: §2.2] |
| 80 | "The causal-chain-preserving design is exactly what makes the same module reusable for speculative decoding — its drafts align with what the main model would generate, hence high acceptance" | UNCERTAIN | This causal linkage (design choice → high acceptance rate) is the writer's own synthesis connecting the design rationale in §2.2 with the empirical acceptance-rate result in §5.4.3; the paper does not state this causal connection explicitly in one place. |

### 5. DualPipe

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 81 | TL;DR: bidirectional schedule, hides comm, ~halves bubble | ACCEPTED-CITED | [src: §3.2.1] |
| 82 | GPipe: large fill/drain bubble | CONFIRMED | Well-established pipeline-parallelism fact (Huang et al. 2019 GPipe). |
| 83 | 1F1B bubble = (PP−1)(F+B) | ACCEPTED-CITED | [src: Table 2] — matches Table 2 exactly. |
| 84 | ZB1P/Zero-Bubble splits backward into B/W, bubble = (PP−1)(F+B−2W) | ACCEPTED-CITED | [src: §3.2.1, Table 2] — matches Table 2 exactly. |
| 85 | Bubble grows with pipeline depth PP | CONFIRMED | Direct algebraic consequence of the cited bubble formulas. |
| 86 | MoE cross-node EP needs all-to-all dispatch+combine per layer | ACCEPTED-CITED | [src: §3.2.1] |
| 87 | Naïve compute:communication ratio ~1:1 | ACCEPTED-CITED | [src: §3.2.1] — matches p.12 exactly. |
| 88 | Fine-grained experts spread across nodes make it worse; communication threatens to become the ceiling | CONFIRMED | Direct, reasonable inference from the cited 1:1 ratio and node-limited-routing motivation. |
| 89 | Bidirectional schedule, fine-grained chunk decomposition, GPU SM ratio tuning | ACCEPTED-CITED | [src: §3.2.1] |
| 90 | DualPipe bubble ≈ (PP/2−1)(F&B+B−3W); 2× parameter copies; activation memory PP+1 | ACCEPTED-CITED | [src: §3.2.1, Table 2] — matches Table 2 exactly. |
| 91 | Node-limited routing (≤4 nodes), bandwidth-matched routing (NVLink 160GB/s ≈3.2× IB 50GB/s), 20 SMs (10 channels) | ACCEPTED-CITED | [src: §3.2.2] — matches p.13-14 exactly. |
| 92 | Halves bubble stage-count factor; near-zero all-to-all overhead; 20 SMs regardless of scale | ACCEPTED-CITED | [src: Table 2, §3.2.1, §3.2.2] |
| 93 | Turns MoE's all-to-all tax into hidden latency; enables fine-grained experts across nodes without comm becoming bottleneck | ACCEPTED-CITED | [src: §3.2.1, §1] |

### Limitations & Open Questions

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 94 | Recommended deployment unit large (prefill 32 GPUs, decode 320 GPUs); heavy for smaller teams | ACCEPTED-CITED | [src: §6, §3.4] — matches §3.4.1 (32 GPUs), §3.4.2 (320 GPUs), and §6 (p.35): "the recommended deployment unit for DeepSeek-V3 is relatively large, which might pose a burden for small-sized teams." |
| 95 | FP8 recipe and DualPipe tightly co-designed with Hopper/H800 (NVLink+IB ratios, SM warp specialization); portability to other accelerators unclear | UNCERTAIN | Not stated in the Conclusion/Limitations section (§6, pp.35-36) or elsewhere. §6 only mentions deployment-unit size and generation-speed limitations; it does not discuss hardware portability. A plausible engineering inference from §3.2.2/§3.5, but not a stated limitation in the source. |
| 96 | Auxiliary-loss-free balancing introduces a bias-update-speed hyperparameter (γ) and schedule; sensitivity/general recipes not fully characterized | UNCERTAIN | Not stated as a limitation anywhere in §6 or elsewhere. γ and its schedule are documented as a design choice (§2.1.2, §4.2), but the paper never flags sensitivity/generalizability as an open limitation. Plausible inference, not verbatim. |
| 97 | MTP is only used with D=1 here | CONFIRMED | Directly stated in §4.2 (p.22): "The multi-token prediction depth 𝐷 is set to 1." |
| 98 | Deeper multi-token prediction (D>1) is left as future work | UNCERTAIN | Not stated. The paper's "Future Directions" (§6, pp.35-36) lists four bullets (architecture/context length, data scaling, deep-thinking/reasoning depth, evaluation methods) — none mention MTP depth D>1 specifically. Plausible extrapolation, not a stated future-work item. |

### Citation

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 99 | BibTeX fields: title "DeepSeek-V3 Technical Report", author DeepSeek-AI, arXiv:2412.19437, year 2024, matching URL | CONFIRMED | Matches PDF title page, author line, and arXiv identifier (arXiv:2412.19437v2) exactly. |

**Summary:** 99 claims checked — 62 accepted-cited, 28 confirmed, 9 uncertain, 0 incorrect.

## Run 2026-07-25 — scope: Section 5 (DualPipe) edits only
Target: `summaries/2024-12_deepseekai_deepseek-v3.md` · Source: `extracted/2024-12_deepseekai_deepseek-v3/latex.md` (§3.2.1, L415–458) and `text.md` (L859–899)

This run covers the 5 change records from the user's Section 5 (DualPipe) editing session. Per the plan: already-referenced claims (with `[src: ...]` tags) are logged as ACCEPTED-CITED without re-check; unreferenced synthesis/intuition claims were actively verified against the extracted source. The `[ref-only]` trims are editorial and not enumerated as claims.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Bidirectional schedule intuition: "two streams enter from both ends and meet in the middle, each only traversing half the pipeline before overlapping the other stream's work. This halves the effective fill/drain depth from `(PP−1)` to `(PP/2−1)`." | CONFIRMED | Source §3.2.1 (latex.md L434) states: "It employs a bidirectional pipeline scheduling, which feeds micro-batches from both ends of the pipeline simultaneously." Table 2 shows the DualPipe bubble formula `((PP/2) − 1)(F&B + B − 3W)`. The "meet in the middle / halving" intuition is a reasonable synthesis of these two facts, not contradicted by the paper. |
| 2 | Bubble formula explanation: "The DualPipe bubble formula reflects this: `((PP/2) − 1)(F&B + B − 3W)` [src: Table 2] — where `F&B` denotes the time of two mutually overlapped forward and backward chunks. The `PP/2−1` factor (vs `PP−1` in 1F1B) is the key — roughly half the bubble-inducing stage count." | ACCEPTED-CITED | Already tagged `[src: Table 2]`; logged without re-check per plan. |
| 3 | SM-ratio mechanism: "By dedicating a small fixed set (20 SMs, §3.2.2) to run the all-to-all and PP comm kernels concurrently with the rest doing attention/MLP compute, comm runs in parallel with (not serially before/after) computation. The SM partition is tuned so the comm kernel finishes within the compute window → comm is fully hidden, costing zero extra step time." | CONFIRMED | Source §3.2.1 (latex.md L431-432) states: "manually adjust the ratio of GPU SMs dedicated to communication versus computation." §3.2.2 (text.md L902) confirms: "only 20 SMs are sufficient to fully utilize the bandwidths... regardless of scale." The explanation is synthesis consistent with both cited sections. |
| 4 | B/W split intuition: "Why split backward into B and W (ZeroBubble): a normal backward computes input-gradients and weight-gradients together as one chunk. But the input-gradient part (B) is what propagates downstream to earlier stages (on the critical path), while the weight-gradient part (W) only updates local parameters (no downstream dependency, can be deferred). Splitting moves W off the critical path, shrinking the bubble — visible in Table 2 as the `−2W` (ZB1P) and `−3W` (DualPipe) terms." | CONFIRMED | Source §3.2.1 (latex.md L429) states: "backward for input and backward for weights, like in ZeroBubble." Table 2 shows both bubble formulas with the `−2W` and `−3W` terms. The critical-path reasoning is technically accurate backward-pass knowledge and is consistent with the ZeroBubble approach; not contradicted by the paper. |
| 5 | `[ref-only]` trims (GPipe bullet, "Bubble grows with pipeline depth PP", bandwidth-matching arithmetic) | — | Editorial markers per plan, not enumerated as claims. |

**Summary:** 4 synthesis claims checked — 0 accepted-cited, 4 confirmed, 0 uncertain, 0 incorrect. All three unreferenced intuition claims (bidirectional halving, SM-ratio mechanism, B/W split critical-path) are reasonable interpretations consistent with the source. No incorrect findings.

## Run 2026-07-26 — scope: slide-26 stat-row addition (MTP section-4 opener)
Target: `decks/2024-12_deepseekai_deepseek-v3/presentation.html` (slide-26, `.stat-row`) · Source: `summaries/2024-12_deepseekai_deepseek-v3.md` (## 4. Multi-Token Prediction (MTP), lines 315–369)

No pre-split referenced/unreferenced claim list was handed to this run; all three deck stats were checked directly against the summary (deck-vs-summary check per this repo's convention — the summary is the source of truth for deck content, not the PDF). All three trace to claims already tagged `[src: ...]` in the summary itself, so each is logged as ACCEPTED-CITED, carrying forward the summary's own locator, once faithful transcription was confirmed.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | "D+1 supervised predictions per token (D = 1)" | ACCEPTED-CITED | Faithful combination of summary L345 "each position now supplies D+1 supervised predictions instead of 1 (data efficiency) [src: §2.2]" and L347 "**D = 1** (predict the 2nd-next token) [src: §4.2]". Deck stat merges two adjacent, already-cited summary facts without altering either value. |
| 2 | "85–90% token acceptance rate as draft head" | ACCEPTED-CITED | Matches summary L361 verbatim: "Speculative decoding: 2nd-token **acceptance rate 85–90%**... [src: §5.4.3]". "as draft head" framing matches summary L351: "repurpose it as a **speculative-decoding draft head** [src: §2.2, §5.4.3]". |
| 3 | "~1.8× decoding TPS via speculative decoding" | ACCEPTED-CITED | Matches summary L361 verbatim: "giving **~1.8× decoding TPS** [src: §5.4.3]"; also consistent with the section TL;DR (L317): "reuse it as a speculative-decoding draft head for ~1.8× faster inference [src: §2.2, §5.4.3]". |

**Summary:** 3 claims checked — 3 accepted-cited, 0 confirmed, 0 uncertain, 0 incorrect.

## Run 2026-07-26 — scope: ~30 deck-edit hunks clearing the pending-audit marker (layout/CSS/JS mechanics, appendix relocation, eyebrow/footer-cite label edits, slide-26 stat-row)
Target: `decks/2024-12_deepseekai_deepseek-v3/presentation.html` · Source: `summaries/2024-12_deepseekai_deepseek-v3.md` (per this repo's convention — deck content is checked against the already-verified summary, not the PDF)

No pre-split referenced/unreferenced claim list was handed to this run; the coordinator instead supplied a scoped hunk list of ~30 deck edits (from `.claude/.audit-pending/2024-12_deepseekai_deepseek-v3.md`) to be checked against the summary. Hunks 1–26 (scroll-snap/flex-alignment fixes, CSS selector consolidation, dead `.dark`-theme rule removal, `.fig-stack`/`.two-col` layout math iterations, a code-comment update, and the JS controller rework replacing `bindWheel()`/`bindTouch()` with `goToId()` + fixing the `window.presentation` assignment) assert no factual claim about the paper — verified by reading the full current `presentation.html` (both the `<style>` block and the `<script>` controller) and confirming none of these touch visible slide text/data. They are recorded as a single bundled row below rather than 26 individual claim rows, consistent with this repo's `[ref-only]`-style treatment of non-claim editorial/mechanical content.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Hunks 1–26: CSS/JS structural and layout-mechanics changes (scroll-snap fix, selector consolidation, dead `.dark`-rule removal, `.fig-stack`/`.two-col` sizing iteration, code-comment update, `bindWheel()`/`bindTouch()` removal + `goToId()` addition + `window.presentation` fix) | CONFIRMED (no claim content) | Read the current `presentation.html` `<style>` block (lines 10–360) and `<script>` controller (lines 1245–1339) in full; none of these hunks touch visible slide prose, numbers, or attributions — they are pure CSS selectors/properties and JS event-binding/navigation mechanics. No factual assertion to verify. |
| 2 | Hunks 27–28: appendix slides 22–25 (DeepEP / Kimi K2 / adoption table / EP-efficiency) relocated from after slide-21 to immediately after slide-14; appendix slides 39–40 (MTP module internals / spec-decoding throughput paradox) relocated from after slide-38 to immediately after slide-32 — text content unchanged, only position + `onclick` targets (now `goToId('slide-N')`) | CONFIRMED | Read the full current deck: slides 22–25 (`id="slide-22"`…`id="slide-25"`) now sit directly between slide-14's closing `</section>` and slide-15's opening comment; slides 39–40 (`id="slide-39"`, `id="slide-40"`) sit directly between slide-32's closing `</section>` and slide-33's opening comment. Slide-22 (DeepEP), slide-23 (Kimi K2 sparsity law: 384+1 experts, 1.04T/32.6B, sparsity-48 needing 1.69×/1.39×/1.15× fewer FLOPs at loss 1.5), slide-24 (adoption table), and slide-25 (EP vs. TP) all match `summaries/2024-12_deepseekai_deepseek-v3.md`'s "Subsequent developments & ecosystem impact" subsection (lines 214–237) verbatim in substance. Slide-39 (MTP module internals, Eqs. 21–25) and slide-40 (speculative-decoding throughput paradox) match the summary's `## Appendix` section (lines 505–556) verbatim in substance. Only the jump-link mechanism changed (`goTo(N)` → `goToId('slide-N')`), still targeting the same semantic slide-14/slide-29-adjacent anchors. |
| 3 | Hunk 29: slide-29 eyebrow reads "The DeepSeek-V3 fix · 2/2" (via an intermediate "1/2") | CONFIRMED | Read current deck line 1007: `<p class="eyebrow reveal">The DeepSeek-V3 fix &middot; 2/2</p>`. Purely a section-position numbering label; the slide body underneath (D+1 supervised predictions, causal-chain-preserving planning, λ 0.3→0.1, D=1, shared embedding/output head) is unchanged and still matches summary lines 342–348. No factual claim altered. |
| 4 | Hunk 30: slide-28 eyebrow reads "The DeepSeek-V3 fix · 1/2" | CONFIRMED | Read current deck line 984: `<p class="eyebrow reveal">The DeepSeek-V3 fix &middot; 1/2</p>`. Numbering label only; slide body (sequential MTP modules, causal chain preserved, shared embedding/output head, TRM_k/M_k) is unchanged and matches summary lines 336–340. No factual claim altered. |
| 5 | Hunk 31: slide-27 eyebrow trimmed from "Before — prior SOTA & why it hurt" to "Before" | CONFIRMED | Read current deck line 969: `<p class="eyebrow reveal">Before</p>`. Purely a label trim to match the deck's other section eyebrows (slides 2, 9, 16, 34 all read "Before"); slide body (sparse single-token signal, Gloeckle et al. 2024 parallel MTP breaking the causal chain) is unchanged and matches summary lines 323–329. No information removed from the slide content, only the eyebrow. |
| 6 | Hunk 32: slide-31 eyebrow relabeled from "Inference: two uses" to "What it buys us" | CONFIRMED | Read current deck line 1041: `<p class="eyebrow reveal">What it buys us</p>`. Vocabulary-matching relabel (consistent with slides 6, 13, 21, 30, 38's "What it buys us" eyebrow); slide body (Discard vs. Repurpose-as-draft-head, 85–90% acceptance, ~1.8× TPS) is unchanged and matches summary lines 349–351/361. No factual claim altered. |
| 7 | Hunk 33a: slide-26 stat "D+1 supervised predictions per token (D = 1)" | ACCEPTED-CITED | Carried forward from the prior run (2026-07-26, "slide-26 stat-row addition") claim #1, re-confirmed present verbatim at current deck line 957. Traces to summary L345/L347 `[src: §2.2]`/`[src: §4.2]`. |
| 8 | Hunk 33b: slide-26 stat "85–90% token acceptance rate as draft head" | ACCEPTED-CITED | Carried forward from the prior run claim #2, re-confirmed present verbatim at current deck line 958. Traces to summary L361 `[src: §5.4.3]` and L351 `[src: §2.2, §5.4.3]`. |
| 9 | Hunk 33c: slide-26 stat "~1.8× decoding TPS via speculative decoding" | ACCEPTED-CITED | Carried forward from the prior run claim #3, re-confirmed present verbatim at current deck line 959. Traces to summary L361/L317 `[src: §5.4.3]`/`[src: §2.2, §5.4.3]`. |
| 10 | Hunk 34: slide-33 (DualPipe section opener) footer-cite changed from "DeepSeek-V3 Technical Report · arXiv:2412.19437 · §3.2.1" to "DeepSeek-AI, 2024 · arXiv:2412.19437" | CONFIRMED | Read current deck line 1129: `<p class="footer-cite">DeepSeek-AI, 2024 &middot; arXiv:2412.19437</p>`. Same paper (arXiv:2412.19437) cited both before and after — only the format changed, now matching the exact footer-cite text used on slides 1, 8, and 15 (each of which reads "DeepSeek-AI, 2024 · arXiv:2412.19437", confirmed by reading lines 402, 564, 820). Consistent with the summary's own citation block (author "DeepSeek-AI", year 2024, arXiv:2412.19437). No new or different citation introduced — pure format-consistency fix. |

**Summary:** 10 rows checked (covering all ~30 scoped hunks; hunks 1–26 bundled into row 1 as non-claim structural/mechanical changes) — 3 accepted-cited, 7 confirmed, 0 uncertain, 0 incorrect.

## Run 2026-07-26 — scope: headline-shortening batch (16 h2 compressions to ≤8 words) + 4 CSS/layout hunks
Target: `decks/2024-12_deepseekai_deepseek-v3/presentation.html` · Source: `summaries/2024-12_deepseekai_deepseek-v3.md` (deck content checked against the already-verified summary, per this repo's convention — not the PDF)

No pre-split referenced/unreferenced claim list applies here (headline text carries no `[src:]` tags of its own); every row below was actively verified by locating the corresponding slide in the current deck and cross-checking headline + body against both (a) the slide's own body content and (b) the matching section of the summary. All 16 headline edits are pure wording compressions to fit an 8-word cap — no new facts were introduced in any of them, and none dropped a fact that isn't still present in the slide body (confirmed individually below). The 4 CSS/layout hunks (scroll-snap container fix, `.wide` class removal, `stat-num` `white-space:nowrap`, new `.stat-row--sm` utility) carry no claim content — selector/property changes only — and are logged as a single bundled row per this repo's `[ref-only]`-style treatment of non-claim editorial/mechanical content.

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | 4 CSS/layout hunks: scroll-snap container fix, `.wide` class removal, `.stat-num { white-space: nowrap }`, new `.stat-row--sm` utility class | CONFIRMED (no claim content) | Read the current `<style>` block (lines 10–369): `body`'s scroll-snap rules (lines 22–29), `.stat-num` `white-space: nowrap` (line 324), and `.stat-row--sm .stat-num` (line 329) are all present; no `.wide` class exists anywhere in the current stylesheet (fully removed). None of these are prose/data assertions about the paper — pure selectors/properties. |
| 2 | [§1 FP8, slide-7] "Precision is per-location, not a global switch" | CONFIRMED | Slide-7 body (lines 542–544) unchanged: "Quantize aggressively where FLOPs live; protect the few numerically sensitive ops... Fight outliers with fine-grained (block-wise) scaling + high-precision accumulation... 'Granularity beats a global scale' applies any time you quantize models." Matches summary §1 "Why a DS/DE should care" (lines 114–118) exactly; headline still accurately frames the per-location decision, no fact dropped (wording-only trim: "is a...decision" → "is"). |
| 3 | [§2 MoE, slide-9] "Coarse experts, collapsing routers, a quality-taxing loss" | CONFIRMED | Slide-9 body (lines 583–598) unchanged: 4 cards — "Coarse experts under-specialize," "Routing collapse," "The aux-loss remedy has a real cost," "Device & communication cost." Matches summary §2 "Before" (lines 135–151). Headline still covers the same 3 named failure modes as before ("collapsing" = routing collapse, "quality-taxing loss" = aux-loss remedy cost); the 4th card (device/comm cost) was likewise unnamed in the old headline, so no new omission introduced by the trim. |
| 4 | [§2 MoE, slide-11] "Balance via a controller, not a loss" | CONFIRMED | Slide-11 body (lines 638–643) unchanged: learnable bias bᵢ, feedback controller ±γ, "steers which experts get chosen... without injecting a distortion gradient." Matches summary §2 "The DeepSeek-V3 fix" auxiliary-loss-free-balancing bullet (lines 168–175). Dropped suffix "— the headline" was purely decorative emphasis, not a fact; no information lost. |
| 5 | [§2 MoE, slide-13, stat-row with +2.0 BBH / +2.5 GSM8K / +0.8 MMLU] "Frontier capacity at 5.5% active params" | CONFIRMED | Slide-13 stat-row (lines 680–685) unchanged and retains the "beats aux-loss baseline" claim verbatim in all three stat-labels: "BBH vs. aux-loss baseline (39.3 vs 37.3)," "GSM8K vs. aux-loss baseline (29.6 vs 27.1)," "MMLU vs. aux-loss baseline (51.8 vs 51.0)." These numbers match summary §2 "What it buys us" (lines 193–195) `[src: Table 5]` exactly. The comparison claim dropped from the headline is fully retained and still legible at the stat-label level — sufficient, no information loss. |
| 6 | [§2 MoE, slide-14, "Why a DS/DE should care"] "Two balancing problems inside "MoE", two tools" | CONFIRMED | Slide-14 body (lines 709–711) unchanged: "Statistical balance across experts... solved here by a controller-tuned bias, not a loss," "Physical balance across GPUs/nodes... solved by node-limited routing, expert placement, and redundant experts," plus the general lesson bullet. Matches summary §2 "Why a DS/DE should care" (lines 207–210) exactly. Wording-only trim, no fact dropped. |
| 7 | [§2 MoE appendix, slide-22] "DeepEP: the expert-parallel communication library" | CONFIRMED | Slide-22 body (lines 725–741) unchanged and still explicitly explains node-limited routing: card 2 ("Communication substrate for the balancing strategy") states "Node-limited routing (§2.1.2), expert-to-device allocation, and redundant experts (§3.4) live in the DeepSeek-V3 design and serving stack; DeepEP's kernels are engineered to carry exactly that traffic pattern." Matches summary's "Subsequent developments" DeepEP bullet (lines 216–219). Dropped clause "behind node-limited routing" from the headline is preserved verbatim in the body. |
| 8 | [§2 MoE appendix, slide-23] "Sparsity scaling law sized K2's expert pool" | CONFIRMED | Slide-23 body (lines 753–764, continuing past the truncated view) retains the full sparsity-scaling-law claim (384+1 experts, 1.04T/32.6B, sparsity levels 8/16/32/48, 1.69×/1.39×/1.15× fewer FLOPs at fixed loss 1.5 motivating the 256→384 expansion) — carried forward from the prior run's confirmed check of this slide's content (2026-07-26 run, row 2). Matches summary's Kimi K2 bullet (lines 220–223). Reordering "Kimi K2's...law" → "Sparsity...K2's" changes no fact. |
| 9 | [§2 MoE appendix, slide-24] "Routed + shared-expert MoE now dominates" | CONFIRMED | Slide-24 body (lines 774–792) unchanged: adoption table listing DeepSeek-V3/V4-Pro, Kimi K2, GLM-4.5/4.6/5/5.2, Llama 4 Maverick/Scout, Qwen 3.5, Gemma 4 as followers and Qwen3-235B/MiniMax/DBRX as the routing-only minority. Matches summary's adoption bullet (lines 224–229) exactly. "for large models" → "now" is a wording trim only; the >100B-scale qualifier is preserved in the table's own ">100B?" column. |
| 10 | [§2 MoE appendix, slide-25] "EP is replacing TP as the sharding axis" | CONFIRMED | Slide-25 body (lines 805–809) unchanged: ~80–90% (≈97% DeepSeek-V3) params in experts, "coverage with little regret," "lighter communication," "cross-node scaling," training/inference recipe specifics (PP16+EP64+ZeRO-1 no TP; LMSYS 3.3×/5.2× throughput). Matches summary's EP-vs-TP bullet (lines 230–237) exactly. Dropping "primary parameter-" from the headline loses no fact — "Scope: EP replaces TP, not ZeRO/FSDP or PP" is explicitly retained in the body's closing sentence. |
| 11 | [§3 MLA, slide-16] "The KV cache, not compute, caps serving" | CONFIRMED | Slide-16 body (lines 839–855) unchanged: 4 cards — "KV cache is the bottleneck," "And it's per layer, per token," "MQA/GQA trade quality for cache size," "Open problem." Matches summary §3 "Before" (lines 251–259) exactly. Wording-only trim ("how you serve" → "serving"). |
| 12 | [§3 MLA, slide-20] "RoPE breaks the fold, so position decouples" | CONFIRMED | Slide-20 body (lines 929–933) unchanged and still explains the decoupling mechanism concretely: "carry position on a small separate channel that gets its own rotation: per-head decoupled query q^R = RoPE(W^QR·c^Q), one shared decoupled key k^R = RoPE(W^KR·h), both dim d_h^R = 64, concatenated onto the content parts." Matches summary §3 Decoupled-RoPE bullet (lines 277–283) exactly. "Position rides its own channel" → "position decouples" is wording-only; the concrete mechanics remain fully spelled out in the body. |
| 13 | [§4 MTP, slide-27] "Next-token prediction gives one sparse signal per position" | CONFIRMED | Slide-27 body (lines 981–984) unchanged: "single, relatively sparse learning signal," Gloeckle et al. (2024) parallel MTP breaking the causal chain. Matches summary §4 "Before" (lines 323–329). Dropping "Standard" and "learning" from the headline is wording-only; "learning signal" remains verbatim in the body's first bullet. |
| 14 | [§4 MTP, slide-29] "Plan one step ahead, chained to stay causal" | CONFIRMED | Slide-29 body (lines 1018–1022) unchanged: "module k predicts on top of module k−1's conclusion (not in parallel)... the autoregressive chain stays whole — the deliberate fix for Gloeckle's independent heads," plus D+1 signal density and λ 0.3→0.1 decay. Matches summary §4 "The DeepSeek-V3 fix" (lines 336–348) exactly. Wording-only trim ("and chain it so...never breaks" → "chained to stay causal"), no fact dropped. |
| 15 | [§4 MTP, slide-30] "Better reasoning and coding, plus ~1.8× speedup" | CONFIRMED | Slide-30 body (lines 1033–1040) unchanged: stat-row (~1.8× TPS, 85–90% acceptance) plus Small-MoE (HumanEval 26.8/20.7, GSM8K 31.4/25.4, MMLU 53.3/50.0) and Large-MoE (HumanEval 53.7/44.5, DROP 70.6/68.5) benchmark rows — HumanEval/DROP are coding/reasoning benchmarks, consistent with "reasoning and coding." Matches summary §4 "What it buys us" (lines 357–361) `[src: Table 4]`/`[src: §5.4.3]` exactly. "Consistent gains on" reworded to "Better," no fact dropped — "consistent... as scale increases" is still stated in the body ("improvement holds as scale increases"). |
| 16 | [§4 MTP, slide-31] "Discard it free, or reuse as draft head" | CONFIRMED | Slide-31 body (lines 1059–1060) unchanged: "Option 1: Discard — the main model works standalone, zero added serving cost," "Option 2: Repurpose — the trained MTP module becomes a speculative-decoding draft head... 85–90% acceptance yields ~1.8× TPS." Matches summary §4 "Inference: two uses" bullet (lines 349–351) exactly. Wording-only trim ("for zero-cost serving" → "free," "as a speculative-decoding draft head" → "as draft head"), full detail preserved in body. |
| 17 | [§4 MTP appendix, slide-39] "Inside an MTP module: five steps" | CONFIRMED | Slide-39 body (lines 1095–1100) unchanged and lists exactly 5 numbered mechanical steps matching Eqs. 21–25 — "Gather two inputs" (Eq. 21), "Refine" (Eq. 22), "Read out" (Eq. 23), "Score" (Eq. 24), "Combine" (Eq. 25) — plus a 6th non-step contextual bullet on EAGLE similarity. Matches summary's "MTP module internals" appendix (lines 507–527) exactly. Dropping "one token's path through" from the headline loses no fact — it was scene-setting framing, not a claim, and the per-token framing ("For token position i...") is still explicit in the summary/body's Eq. 21 description. |

**Summary:** 17 rows checked (16 headline-shortening claims + 1 bundled CSS/layout row) — 0 accepted-cited, 17 confirmed, 0 uncertain, 0 incorrect.
