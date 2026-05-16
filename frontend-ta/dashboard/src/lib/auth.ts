export function getAdminEmail(): string {
    try {
        const token = localStorage.getItem('admin-token');
        if (!token) return '';
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub ?? payload.email ?? '';
    } catch {
        return '';
    }
}

export function getAdminName(): string {
    try {
        const token = localStorage.getItem('admin-token');
        if (!token) return '';
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.name ?? payload.sub ?? '';
    } catch {
        return '';
    }
}
