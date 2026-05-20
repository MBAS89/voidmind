# VoidMind — Terraform Configuration for Hetzner Cloud
# Provisions a VPS with firewall, network, and DNS-ready setup.

terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "domain" {
  description = "Domain name for the server"
  type        = string
  default     = "voidmind.example.com"
}

variable "server_type" {
  description = "Hetzner server type"
  type        = string
  default     = "cpx21"  # 4 vCPU, 8GB RAM (~$12/mo). Use cpx31 for 8 vCPU, 16GB.
}

variable "location" {
  description = "Datacenter location"
  type        = string
  default     = "nbg1"  # Nuremberg, Germany (GDPR)
}

provider "hcloud" {
  token = var.hcloud_token
}

# Firewall
resource "hcloud_firewall" "voidmind" {
  name = "voidmind-firewall"

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# SSH Key
resource "hcloud_ssh_key" "default" {
  name       = "voidmind-admin"
  public_key = file("~/.ssh/id_rsa.pub")
}

# Server
resource "hcloud_server" "voidmind" {
  name        = "voidmind-gateway"
  server_type = var.server_type
  image       = "ubuntu-22.04"
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.default.id]
  firewall_ids = [hcloud_firewall.voidmind.id]

  labels = {
    project   = "voidmind"
    managed_by = "terraform"
  }

  # Cloud-init for initial setup
  user_data = <<-EOF
    #cloud-config
    package_update: true
    packages:
      - curl
      - git
      - nginx
      - ufw
      - fail2ban
      - sqlite3
    runcmd:
      - ufw default deny incoming
      - ufw default allow outgoing
      - ufw allow 22/tcp
      - ufw allow 80/tcp
      - ufw allow 443/tcp
      - ufw --force enable
      - systemctl enable fail2ban
      - systemctl start fail2ban
  EOF
}

# Floating IP (optional, for DNS stability)
resource "hcloud_floating_ip" "voidmind" {
  type      = "ipv4"
  server_id = hcloud_server.voidmind.id
}

# Outputs
output "server_ip" {
  description = "Public IPv4 address"
  value       = hcloud_server.voidmind.ipv4_address
}

output "floating_ip" {
  description = "Floating IPv4 address"
  value       = hcloud_floating_ip.voidmind.ip_address
}

output "server_id" {
  description = "Server ID"
  value       = hcloud_server.voidmind.id
}
