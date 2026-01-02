class InventoryManager {
    constructor(userId) {
        this.userId = userId;
        this.data = []; // [{id, productId, qty, min, ownerId}]
        this.loading = false;
    }

    async loadData() {
        this.loading = true;
        try {
            const res = await llamarBackend('getInventory', { userId: this.userId });
            if (res.success) {
                this.data = res.items;
                // Merge shared items into view? For now we just show everything user has access to.
                console.log("Inventario cargado:", this.data.length, "items");
            }
        } catch (e) {
            console.error("Error loading inventory:", e);
            // Fallback to offline if needed, but per requirements we focus on backend sync
        } finally {
            this.loading = false;
        }
    }

    getItem(productId) {
        // Find item owned by user first, else look for shared? 
        // Logic: A user can only have one "entry" per product in THEIR inventory.
        // But if viewing "Shared with me", we might see multiple.
        // Simplified: User sees THEIR inventory item.
        const item = this.data.find(i => i.productId == productId && i.ownerId == this.userId);
        return item || { qty: 0, min: 1, ownerId: this.userId };
    }

    async updateStock(productId, delta) {
        const item = this.getItem(productId);
        const newQty = Math.max(0, (item.qty || 0) + delta);

        // Optimistic Update
        const oldQty = item.qty;
        item.qty = newQty;
        this.updateLocalData(item, productId);

        try {
            // Send to backend
            await llamarBackend('updateInventory', {
                payload: {
                    ownerId: this.userId,
                    productId: productId,
                    qty: newQty,
                    min: item.min || 1
                }
            });
        } catch (e) {
            console.error("Sync error:", e);
            // Revert
            item.qty = oldQty;
            this.updateLocalData(item, productId);
            showToast("Error de sincronización. Cambios revertidos.", "error");
        }
        return newQty;
    }

    updateLocalData(item, productId) {
        const index = this.data.findIndex(i => i.productId == productId && i.ownerId == this.userId);
        if (index >= 0) {
            this.data[index] = { ...this.data[index], ...item };
        } else {
            this.data.push({ ...item, productId });
        }
    }

    // Returns list of products that are below minimum stock
    getLowStockItems(allProducts) {
        const lowStock = [];
        this.data.forEach(item => {
            if (item.qty < item.min && item.ownerId == this.userId) { // Check only own items?
                const product = allProducts.find(p => p[0] == item.productId);
                if (product) {
                    lowStock.push({
                        productId: item.productId,
                        name: product[1],
                        current: item.qty,
                        min: item.min,
                        missing: item.min - item.qty
                    });
                }
            }
        });
        return lowStock;
    }

    // Batch update from cleanup/checkout
    async addPurchasedItems(items) {
        for (const i of items) {
            await this.updateStock(i.productId, i.quantity);
        }
    }

    async shareInventory(targetEmailOrId) {
        try {
            const isEmail = String(targetEmailOrId).includes('@');
            const res = await llamarBackend('shareAccess', {
                userId: this.userId,
                [isEmail ? 'targetEmail' : 'targetId']: targetEmailOrId,
                scope: 'inventario'
            });
            if (res.success) {
                showToast(`Acceso a inventario ${isEmail ? 'concedido a ' + targetEmailOrId : 'compartido con ID: ' + targetEmailOrId}`, "success");
            } else {
                showToast(res.message, "error");
            }
        } catch (e) {
            showToast("Error compartiendo: " + e.message, "error");
        }
    }
}
