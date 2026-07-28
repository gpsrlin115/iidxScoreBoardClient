terraform {
  required_version = ">= 1.5.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 6.0.0, < 7.0.0"
    }
  }
}

provider "oci" {
  config_file_profile = var.oci_profile
  region              = var.region
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "oracle_linux" {
  compartment_id           = var.compartment_id
  operating_system         = "Oracle Linux"
  operating_system_version = var.oracle_linux_version
  shape                    = var.instance_shape
  state                    = "AVAILABLE"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

locals {
  availability_domain = var.availability_domain_name != "" ? var.availability_domain_name : data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index - 1].name
  image_id            = var.image_id != "" ? var.image_id : data.oci_core_images.oracle_linux.images[0].id
}

resource "oci_core_instance" "a1" {
  availability_domain  = local.availability_domain
  compartment_id       = var.compartment_id
  display_name         = var.instance_name
  shape                = var.instance_shape
  preserve_boot_volume = false

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_gb
  }

  source_details {
    source_type             = "image"
    source_id               = local.image_id
    boot_volume_size_in_gbs = var.boot_volume_size_gb
  }

  create_vnic_details {
    subnet_id                 = var.subnet_id
    display_name              = "${var.instance_name}-vnic"
    assign_public_ip          = true
    assign_private_dns_record = true
    hostname_label            = var.hostname_label
  }

  metadata = {
    ssh_authorized_keys = file(pathexpand(var.ssh_public_key_path))
  }

  availability_config {
    recovery_action = "RESTORE_INSTANCE"
  }

  freeform_tags = var.freeform_tags

  timeouts {
    create = "60m"
  }
}

output "instance_id" {
  value       = oci_core_instance.a1.id
  description = "Created OCI compute instance OCID."
}

output "instance_public_ip" {
  value       = oci_core_instance.a1.public_ip
  description = "Public IPv4 address assigned to the instance."
}

output "instance_private_ip" {
  value       = oci_core_instance.a1.private_ip
  description = "Private IPv4 address assigned to the instance."
}
