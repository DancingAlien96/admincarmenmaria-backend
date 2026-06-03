# Despliegue (Ansible)

El servidor (Ubuntu 24.04, `62.171.147.235`) se gestiona con Ansible desde sí mismo
(`connection=local`). El código vive en GitHub y el servidor hace `git pull`.

## Playbooks

| Playbook | Qué hace | Cuándo |
|----------|----------|--------|
| `provision.yml` | Instala Docker, Node 22, Nginx, Certbot, PM2, ufw | Una vez (infra) |
| `deploy.yml` | git pull, .env, MySQL Docker, migra, build backend (PM2) + frontend estático | Cada cambio |
| `nginx.yml` | Vhost de Nginx + certificado HTTPS (Certbot) | Una vez / al cambiar dominio |

## Primer despliegue

```bash
cd /opt/carmenmaria/ansible            # o donde estén estos archivos
cp secrets.example.yml secrets.yml     # y rellenar valores reales
ansible-playbook -i inventory.ini provision.yml
ansible-playbook -i inventory.ini deploy.yml -e @secrets.yml
ansible-playbook -i inventory.ini nginx.yml
```

## Desplegar cambios (flujo normal)

1. En local: commit + push a `main` (frontend y/o backend).
2. En el servidor:

```bash
ansible-playbook -i inventory.ini deploy.yml -e @secrets.yml
```

Eso hace `git pull`, reconstruye y recarga backend (PM2) y frontend (estático).
