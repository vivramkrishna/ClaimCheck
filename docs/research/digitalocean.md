# DigitalOcean: supplementary cloud and inference resources

Research date: **31 October 2026**. Included because the event's **Best Open-Source AI Project** challenge links to DigitalOcean. It is not a fourth group in the original ten-entry Links & Resources section.

## What it does

DigitalOcean provides cloud infrastructure and managed application services. For this hackathon, the useful distinction is between running your web application, running a model yourself, and calling hosted inference. The [MLH partner page](https://www.mlh.com/partners/digitalocean) introduces Gradient AI and links to application hosting, virtual machines, storage, documentation, libraries, and the `doctl` CLI.

### App Platform

App Platform is a managed platform that deploys applications from Git repositories or container images, handling application builds and underlying infrastructure. Its documentation includes web services, static sites, workers, environment variables, logs, storage, scaling, and app specifications. [Official App Platform docs](https://docs.digitalocean.com/products/app-platform/)

**When useful:** you want a managed deployment path for a service with a supported runtime or container. It is a possible place to investigate a separate Python graph service if your chosen Cloudways plan cannot host it.

**What to validate:** build and run commands, port, runtime secrets, region, storage persistence, plan cost, and a health check. A static site can render a UI; it cannot safely act as the secret-bearing backend for a model API key.

### Droplets

Droplets are Linux virtual machines. They offer a route for running a custom application stack, Python Graphify service, or a model-serving stack on appropriately sized hardware. You take responsibility for more of the setup and operation than with a managed application product. [Official Droplet docs](https://docs.digitalocean.com/products/droplets/)

**When useful:** you need persistent processes or control over the operating environment. For self-hosted inference, first verify a suitable GPU/CPU offering, model memory requirements, quota, and regional capacity. A small general-purpose VM is not interchangeable with a GPU inference machine.

### Inference and the Gradient-linked documentation

The older Gradient AI Platform documentation URL currently redirects to **Inference**. The current docs describe a model catalog, model comparisons, serverless calls, dedicated inference endpoints, and routing. Serverless inference allows direct model requests without constructing an agent first. [Current Inference docs](https://docs.digitalocean.com/products/inference/)

**When useful:** you want a managed model endpoint and the catalog contains the exact model you need. Do not assume Gemma 4 is available on a particular DigitalOcean endpoint: model availability, access keys, pricing, and API details must be checked against the live catalog. The Gemma guide in this folder uses the independently documented Google-hosted route.

## How to get started without overbuilding

1. Choose one role for DigitalOcean: web hosting, a Python graph backend, or inference.
2. Open that product's quickstart and inspect the selected plan and current limits.
3. Deploy a minimal health endpoint or make a small model request before integrating the full UI.
4. Put secrets in the product's runtime configuration and record the resource IDs.
5. Verify logs, an error path, and how to stop or remove resources you will not keep.

This is a suggested validation sequence, not an executed deployment. For the main three-product idea, you may not need a separate DigitalOcean resource at all.

## DigitalOcean and Cloudways are distinct deployment targets

Cloudways is a DigitalOcean-owned managed hosting product, but DigitalOcean App Platform, a directly created Droplet, and a Cloudways application are different services and control panels.

The Cloudways cookbook is itself published on an `ondigitalocean.app` address and includes an App Platform specification for hosting that guide. Copying that specification would deploy the guide on App Platform; it would not establish that your project is deployed on Cloudways. For **Best Use of Cloudways**, follow the stated requirement for a live Cloudways deployment. [Cookbook repository](https://github.com/AshutoshKr17/cloudways-cookbook/tree/main), [Cloudways challenge](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a18738-a864-2307-402a-4a77d6f8267a)

Conversely, the **Best Open-Source AI Project** description asks for meaningful open-source/open-weight AI use and originality; its visible text does not state that using DigitalOcean is compulsory. [Open-source AI challenge](https://www.mlh.com/events/hacktoberfest-hack-day-hyderabad-x-ai-community-hyderabad/challenges/01a0d987-0c41-12ea-13ac-5b85755dc2f3)

## Credit offer discrepancy

The MLH DigitalOcean partner page's numbered instructions advertise **$5** in signup credits and say to ask an MLH coach about additional credits. A separate resource card on that same page advertises **$200** through a signup link. These statements are inconsistent; do not treat either amount as a confirmed entitlement. Inspect the signup offer and ask the coach which event offer applies before budgeting a GPU or paid service. This is separate from the Cloudways cookbook's `CWFEST20` promotion. [MLH partner page](https://www.mlh.com/partners/digitalocean)

## Useful links

- [MLH DigitalOcean hub](https://www.mlh.com/partners/digitalocean)
- [MLH signup link](https://mlh.link/digitalocean-signup)
- [MLH Gradient documentation link](https://mlh.link/digitalocean-gradient)
- [Product documentation](https://docs.digitalocean.com/products/)
- [App Platform](https://docs.digitalocean.com/products/app-platform/)
- [Droplets](https://docs.digitalocean.com/products/droplets/)
- [Inference](https://docs.digitalocean.com/products/inference/)

The product overviews above were read; individual account eligibility, GPU availability, detailed price calculators, and a model-specific DigitalOcean integration were not tested.
