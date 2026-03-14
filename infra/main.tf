terraform {
  required_providers {
    digitalocean = {
      source = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

variable "do_token" {
  description = "DigitalOcean API Token"
  type        = string
  sensitive   = true
}

variable "ssh_fingerprint" {
  description = "SSH Key Fingerprint"
  type        = string
}

provider "digitalocean" {
  token = var.do_token
}

resource "digitalocean_droplet" "chainguard_app" {
  image  = "docker-20-04" # Ubuntu with Docker pre-installed
  name   = "chainguard-production"
  region = "nyc3"
  size   = "s-1vcpu-2gb"
  ssh_keys = [var.ssh_fingerprint]

  provisioner "remote-exec" {
    inline = [
      "mkdir -p /app",
      "cd /app",
      # In a real scenario, you'd transfer the docker-compose.prod.yml
      # and run `docker-compose up -d`
    ]
  }
}

output "droplet_ip" {
  value = digitalocean_droplet.chainguard_app.ipv4_address
}
