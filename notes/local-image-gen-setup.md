# Local AI box: Ubuntu bare metal on an RTX 5070 Ti

Setup notes for a dedicated local AI machine: open-weight image and video
models plus a local LLM, on Ubuntu 24.04 LTS installed directly on the
hardware, with ComfyUI and Ollama as the hosts. No Windows, no WSL2, no
virtualization layer.

Personal-project notes. Nothing here is used by the ACE skills or the
install/bundle scripts.

## Why bare metal and not VMware or WSL2

VMware Workstation and Player do not pass the GPU through to a Linux guest.
The guest sees a virtual SVGA adapter, not the NVIDIA card, so there is no
CUDA inside the VM and every model falls back to CPU. GPU passthrough exists
only on ESXi and vSphere.

WSL2 works (CUDA comes through the Windows driver) but needs a Windows
licence, halves the RAM by default, and adds a filesystem boundary that
slows model loading. On a self-built box with no other use for Windows,
Ubuntu on the metal is simpler and faster. If Windows is ever needed again,
it can be added later as a second drive and dual boot.

## Hardware

Starting point: Dell OptiPlex Tower Plus 7020 with an i7-14700, 64 GB DDR5
UDIMM, 1 TB NVMe. The Dell chassis cannot take the card: proprietary PSU
(260 W or 500 W, no 12V-2x6, no standard ATX swap), GPU length limit around
250 mm, Dell-supported ceiling is an RTX 4060 8 GB. So the CPU, RAM, and
SSD move to a standard build and the Dell becomes a spare shell.

| Part | Pick | Approx KWD |
|---|---|---|
| Motherboard | Gigabyte B760M DS3H Gen5, LGA1700, 4x DDR5, PCIe 5.0 x16, 2x M.2 | 45 |
| Case | Mesh-front ATX mid-tower, 330 mm GPU clearance | 21 to 26 |
| CPU cooler | Thermalright Assassin X 120 SE (Dell cooler does not fit a standard board) | 11 |
| PSU | 850 W ATX 3.1 with native 12V-2x6, e.g. SilverStone DA850R | 37 |
| GPU | RTX 5070 Ti 16 GB GDDR7, Gigabyte Aero OC via Amazon.ae, or Inno3D X3 OC at Microless Kuwait | 330 or 420 |
| Moved from Dell | i7-14700, 64 GB DDR5, 1 TB NVMe | 0 |

Build checklist:

- Flash the board to the latest BIOS before first real use. The i7-14700 is
  Raptor Lake; use the Intel Default Settings power profile, never an
  unlimited or "performance" preset.
- Set PL1 = 125 W, PL2 = 150 W. More than Dell gives it, within the cooler.
- Leave XMP off. Dell modules are 4400 or 5600 MT/s JEDEC; run them as-is.
- The 1 TB NVMe is wiped by the Ubuntu install. Back up anything on the
  Dell's Windows first. The Dell OEM Windows licence stays with the Dell
  board and is not needed.

16 GB VRAM is the floor, not the ceiling. It runs Qwen-Image 2.0 at full
quality, FLUX.2 klein comfortably, and Wan 2.2 5B in FP8. With 64 GB of
system RAM, Wan 2.2 14B and 70B LLMs run with offload, slowly. Video
models want 24 GB to run without offloading; the 24 GB RTX 5070 Ti Super
is rumoured for late 2026 or early 2027 and not released. If video becomes
central, spend on VRAM (RTX 5090 32 GB, about 1,800 KWD in the UAE), not on
generation. Cloud (RunPod or Vast.ai RTX 5090 at 0.50 to 1.00 USD/hour) is
the cheap way to get 24 to 32 GB for occasional jobs.

Fallback without opening the Dell: RTX 5060 Ti 16 GB (180 W, one 8-pin,
about 240 mm) fits the Tower Plus only with the 500 W Dell PSU. Same VRAM,
roughly half the speed, about 170 KWD.

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

Run in order after the build is assembled and the BIOS is flashed. Steps 1
to 4 are done once at the console; everything after can be done over SSH.

### 1. BIOS

- Flash the latest BIOS from Gigabyte before anything else.
- Power profile: Intel Default Settings. PL1 125 W, PL2 150 W. XMP off.
- Secure Boot: leave enabled. The installer will ask to enrol a key for the
  NVIDIA driver (MOK). If that step is skipped or fails, the fallback is to
  disable Secure Boot; nothing else on this box needs it.
- Boot order: USB first for the install, then the NVMe.

### 2. Install Ubuntu 24.04 LTS

Write the Ubuntu 24.04 LTS desktop ISO to a USB stick (Rufus on any Windows
PC, or `dd` on Linux). Boot it and choose:

- Normal installation, with the "Install third-party software for graphics
  and Wi-Fi hardware" box ticked. This installs the NVIDIA driver from
  Ubuntu's repository during setup and handles the Secure Boot key.
- Erase disk and install Ubuntu, on the 1 TB NVMe. Do not use LVM or ZFS;
  plain ext4 is fine and easiest to recover.
- A short hostname and a user with sudo.

Reboot, remove the USB, and log in.

### 3. Confirm the GPU and driver

```bash
nvidia-smi
```

Expect the RTX 5070 Ti with driver 570 or newer and CUDA 12.8 or newer.
Blackwell needs 570+. If `nvidia-smi` is missing or reports no device:

```bash
sudo ubuntu-drivers list
sudo ubuntu-drivers install nvidia:580
sudo reboot
```

Pick the newest `-open` variant the list offers (580-open, 575-open, or
570-open). The open kernel module is the one NVIDIA maintains for new GPUs.
Do not download a `.run` installer from NVIDIA's site; it fights the
package manager on every kernel update.

### 4. Base tooling and SSH

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git python3-venv python3-pip build-essential curl openssh-server ufw
sudo ufw allow OpenSSH
sudo ufw enable
```

From here on, work from another machine over SSH if preferred. Find the IP
with `ip -4 addr` and consider a DHCP reservation on the router so it stays
fixed.

### 5. ComfyUI

```bash
mkdir -p ~/ai && cd ~/ai
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python3 -m venv .venv && . .venv/bin/activate
pip install --upgrade pip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
cd custom_nodes && git clone https://github.com/ltdrdata/ComfyUI-Manager.git && cd ..
```

Blackwell needs the CUDA 12.8 or newer PyTorch build. The cu128 wheel is the
one that has it. An older wheel installs fine and then fails at runtime with
an unsupported architecture error.

Quick test from the terminal:

```bash
python main.py --listen 0.0.0.0 --port 8188
```

Open `http://<box-ip>:8188` from any browser on the LAN. Stop with Ctrl-C
once the page loads.

### 6. ComfyUI as a service

Create `/etc/systemd/system/comfyui.service` (replace `USER` with the login
name):

```ini
[Unit]
Description=ComfyUI
After=network-online.target

[Service]
User=USER
WorkingDirectory=/home/USER/ai/ComfyUI
ExecStart=/home/USER/ai/ComfyUI/.venv/bin/python main.py --listen 0.0.0.0 --port 8188
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now comfyui
sudo ufw allow from 192.168.0.0/16 to any port 8188
journalctl -u comfyui -f
```

Adjust the subnet to the home LAN. ComfyUI has no authentication; never
expose 8188 beyond the LAN.

### 7. First image model

Download Qwen-Image 2.0 in FP8 through the Manager's model browser, load the
bundled Qwen-Image workflow template, and generate. The first image is slow
while it compiles. After that expect a few seconds per 1024 image.

Once images work, Wan 2.2 in the 5B FP8 build is the next download. Clip
times on 16 GB will show whether the VRAM caveat above matters.

### 8. Local LLM: Ollama and Open WebUI

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl edit ollama
```

In the editor that opens, add so the API listens on the LAN:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_KEEP_ALIVE=30m"
```

```bash
sudo systemctl restart ollama
ollama pull qwen3:30b-a3b
ollama run qwen3:30b-a3b "Say hello in one line."
sudo ufw allow from 192.168.0.0/16 to any port 11434
```

The 30B mixture-of-experts fits 16 GB with the KV cache spilling to system
RAM and still runs at chat speed. For coding, pull `qwen3-coder:30b`. For
a stronger dense model that fits entirely in VRAM, a 14B at Q6.

Open WebUI as the chat front end, via Docker:

```bash
sudo apt install -y docker.io
sudo usermod -aG docker $USER && newgrp docker
docker run -d --name open-webui --restart unless-stopped -p 3000:8080 \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data ghcr.io/open-webui/open-webui:main
sudo ufw allow from 192.168.0.0/16 to any port 3000
```

Open `http://<box-ip>:3000`, create the first account (it becomes admin),
and the Ollama models appear in the model picker.

### 9. Sharing the GPU between ComfyUI and Ollama

Both want the 16 GB. Ollama unloads a model after `OLLAMA_KEEP_ALIVE`
expires (30 minutes above). ComfyUI keeps models loaded until it needs the
memory. When switching from chat to image generation, either wait out the
keep-alive, or `ollama stop qwen3:30b-a3b`, or set keep-alive shorter. If
this becomes a daily annoyance it is the argument for a second card later.

## Bare-metal gotchas

- Kernel updates rebuild the NVIDIA module via DKMS. If the desktop comes up
  at low resolution after an update, run `nvidia-smi`; if it fails, reboot
  once more, then `sudo ubuntu-drivers install` again.
- Secure Boot plus a driver update can prompt for the MOK password on the
  next boot. It is the one set during install. Keyboard input at that
  prompt is US layout.
- Keep models under `~/ai`. ComfyUI models go in `~/ai/ComfyUI/models/`,
  Ollama models in `/usr/share/ollama/.ollama/models` by default. Both live
  on the single 1 TB drive with the OS; watch `df -h` and add a second NVMe
  when it passes 80 percent.
- Idle power: the box draws around 60 W idle with the card asleep. Leave it
  on and reach it over SSH; there is no reason to boot it each time.
- No Windows means no Windows-only tools. Everything in this file is native
  Linux. If a Windows tool is ever needed, a second drive and dual boot is
  the clean route, not a VM on this box.

## Offline operation

Generation runs entirely on the local GPU. No licence check, no API key,
no phone-home. Internet is needed only for:

- Initial downloads: ComfyUI, PyTorch, the Manager, and model weights
  (Qwen-Image 2.0 FP8 and Wan 2.2 5B are each roughly 10 GB).
- ComfyUI Manager when installing or updating nodes and models. It does
  nothing on its own.
- Updates, only when run.

Stock ComfyUI and the models listed above make no outbound calls. Some
third-party custom nodes do (helper-model downloads on first use, or
wrappers around cloud APIs). To verify, add a temporary `ufw` deny-outgoing rule after setup and run a
generation.
