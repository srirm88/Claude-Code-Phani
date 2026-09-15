# Local image and video generation on an RTX 5070 Ti

Setup notes for running open-weight image and video models locally on a
Windows PC with an NVIDIA RTX 5070 Ti, using WSL2 as the Linux environment
and ComfyUI as the host.

Personal-project notes. Nothing here is used by the ACE skills or the
install/bundle scripts.

## Why WSL2 and not VMware

VMware Workstation and Player do not pass the GPU through to a Linux guest.
The guest sees a virtual SVGA adapter, not the NVIDIA card, so there is no
CUDA inside the VM and every model falls back to CPU. The "3D acceleration"
checkbox accelerates the virtual display only; PyTorch will not see a CUDA
device. GPU passthrough exists only on ESXi and vSphere.

WSL2 gets CUDA natively from the Windows NVIDIA driver. Same Linux workflow,
real GPU.

## Hardware

| Item | Requirement | Why |
|---|---|---|
| GPU | RTX 5070 Ti, 16 GB GDDR7, Blackwell | FP8 and FP4 support halves model memory footprint |
| PSU | 850 W with 12V-2x6 connector or clean adapter | Card draws around 300 W on its own |
| System RAM | 32 GB | Model loading and offloading; WSL2 claims half by default |

16 GB VRAM is the floor, not the ceiling. It runs Qwen-Image 2.0 at full
quality, FLUX.2 klein comfortably, and Wan 2.2 with quantized weights. Video
models want 24 GB to run without offloading; offloading to system RAM turns a
two-minute clip into a fifteen-minute one. If video becomes central, spend
on VRAM (used RTX 4090 24 GB, or RTX 5090 32 GB), not on generation.

## Model picks

Licence filter: Apache 2.0 or MIT only. No territory caps, no revenue caps,
no user caps.

| Purpose | Model | Licence | Notes |
|---|---|---|---|
| Images, default | Qwen-Image 2.0 (Alibaba) | Apache 2.0 | 7B, generation and editing in one model, correct text rendering, ~16 GB at full precision, use FP8 |
| Images, low VRAM | Z-Image Turbo (Alibaba) | Apache 2.0 | 6B, sub-second generation |
| Images, alternative | FLUX.2 klein 4B (Black Forest Labs) | Apache 2.0 | Check the licence on the exact checkpoint; larger klein and all FLUX dev models are non-commercial |
| Video | Wan 2.2 (Alibaba) | Apache 2.0 | 5B FP8 build fits in 16 GB; expect slow clips |

Skip: HunyuanVideo and Hunyuan Image (Tencent community licence, territory
and MAU caps), LTX-2.3 (Lightricks licence), Stable Diffusion 3.5 (revenue
threshold), SDXL (OpenRAIL use-based restrictions, and older), FLUX dev
(non-commercial).

## Setup

Run in order once the card is installed.

### 1. Windows NVIDIA driver

Install the latest Game Ready or Studio driver on Windows. That single
driver also provides CUDA inside WSL2.

Do not install a Linux NVIDIA driver inside WSL later. That breaks it.

### 2. Install WSL2 with Ubuntu

From an admin PowerShell, then reboot:

```powershell
wsl --install -d Ubuntu-24.04
```

### 3. Confirm the GPU is visible

Inside Ubuntu, before touching anything else:

```bash
nvidia-smi
```

If that shows the 5070 Ti, the hard part is done. If not, stop and fix the
Windows driver first.

### 4. Install Python tooling and ComfyUI

```bash
sudo apt update && sudo apt install -y python3-venv python3-pip git
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python3 -m venv .venv && . .venv/bin/activate
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

Blackwell needs the CUDA 12.8 or newer PyTorch build. The cu128 wheel is the
one that has it. An older wheel installs fine and then fails at runtime with
an unsupported architecture error.

### 5. Install ComfyUI Manager

Makes model and node installs a click rather than a hunt.

```bash
cd custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
cd ..
```

### 6. Start ComfyUI

```bash
python main.py --listen 0.0.0.0
```

Open the address it prints in the Windows browser.

### 7. First model

Download Qwen-Image 2.0 in FP8 through the Manager's model browser, load the
bundled Qwen-Image workflow template, and generate. The first image is slow
while it compiles. After that expect a few seconds per 1024 image.

Once images work, Wan 2.2 in the 5B FP8 build is the next download. Clip
times on 16 GB will show whether the VRAM caveat above matters for the
project.

## WSL2 gotchas

- Keep the ComfyUI folder and models inside the Linux filesystem, not on a
  mounted Windows drive (`/mnt/c/...`). File access across the boundary is
  slow enough to make model loading painful.
- Cap WSL2 memory so it does not starve Windows. Create `.wslconfig` in the
  Windows user folder (`C:\Users\<name>\.wslconfig`):

  ```ini
  [wsl2]
  memory=24GB
  ```

  Then `wsl --shutdown` from PowerShell for it to take effect.
- If the GUI stalls on model load, it is almost always RAM, not VRAM.
- Do not keep the VMware VM in the loop via network shares or port
  forwarding. Compute has to be where the GPU is.
