variable "oci_profile" {
  description = "Profile name in ~/.oci/config."
  type        = string
  default     = "DEFAULT"
}

variable "region" {
  description = "OCI home region, for example ap-chuncheon-1."
  type        = string
}

variable "tenancy_ocid" {
  description = "Tenancy OCID used to list availability domains."
  type        = string

  validation {
    condition     = startswith(var.tenancy_ocid, "ocid1.tenancy.")
    error_message = "tenancy_ocid must start with ocid1.tenancy."
  }
}

variable "compartment_id" {
  description = "Compartment OCID where the instance will be created."
  type        = string

  validation {
    condition     = startswith(var.compartment_id, "ocid1.tenancy.") || startswith(var.compartment_id, "ocid1.compartment.")
    error_message = "compartment_id must start with ocid1.tenancy. or ocid1.compartment."
  }
}

variable "availability_domain_index" {
  description = "1-based availability domain index. Single-AD regions should keep this as 1."
  type        = number
  default     = 1

  validation {
    condition     = var.availability_domain_index >= 1
    error_message = "availability_domain_index must be 1 or greater."
  }
}

variable "availability_domain_name" {
  description = "Optional full availability domain name. Leave empty to use availability_domain_index."
  type        = string
  default     = ""
}

variable "subnet_id" {
  description = "Existing public subnet OCID."
  type        = string

  validation {
    condition     = startswith(var.subnet_id, "ocid1.subnet.")
    error_message = "subnet_id must be a subnet OCID that starts with ocid1.subnet. Do not paste the VCN OCID."
  }
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key file to inject into the instance."
  type        = string
  default     = "~/.ssh/iidx-oci.pub"
}

variable "instance_name" {
  description = "Display name for the A1 instance."
  type        = string
  default     = "iidxinstance"
}

variable "hostname_label" {
  description = "Private DNS hostname label for the primary VNIC."
  type        = string
  default     = "iidx"
}

variable "instance_shape" {
  description = "Always Free Ampere A1 flexible shape."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  description = "A1 OCPU count. Always Free allowance is shared across the tenancy."
  type        = number
  default     = 1

  validation {
    condition     = var.ocpus >= 1 && var.ocpus <= 4
    error_message = "For Always Free use, keep ocpus between 1 and 4."
  }
}

variable "memory_gb" {
  description = "Memory in GB. Always Free A1 total allowance is shared across the tenancy."
  type        = number
  default     = 6

  validation {
    condition     = var.memory_gb >= 1 && var.memory_gb <= 24
    error_message = "For Always Free use, keep memory_gb between 1 and 24."
  }
}

variable "boot_volume_size_gb" {
  description = "Boot volume size. Keep this low to stay within the Always Free block volume allowance."
  type        = number
  default     = 50

  validation {
    condition     = var.boot_volume_size_gb >= 50 && var.boot_volume_size_gb <= 200
    error_message = "boot_volume_size_gb must be between 50 and 200."
  }
}

variable "oracle_linux_version" {
  description = "Oracle Linux image major version."
  type        = string
  default     = "9"
}

variable "image_id" {
  description = "Optional image OCID override. Leave empty to use the latest Oracle Linux image for A1."
  type        = string
  default     = ""
}

variable "freeform_tags" {
  description = "Freeform tags applied to the instance."
  type        = map(string)
  default = {
    project = "iidx-scoreboard"
    purpose = "always-free-a1"
  }
}
