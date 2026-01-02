/**
 * MarketPlanner Savings Manager
 * Handles optimistic concurrency control for group savings.
 * Based on Data Schema v1.0.0
 */

class SavingsManager {
    constructor(currentUser, backendService) {
        this.currentUser = currentUser;
        this.backend = backendService; // { sync: async (data) => serverResponse }
        this.goals = new Map();
        this.loadFromStorage();
    }

    loadFromStorage() {
        const stored = localStorage.getItem(`savings_v2_${this.currentUser.id}`);
        if (stored) {
            const data = JSON.parse(stored);
            data.forEach(g => this.goals.set(g.id, g));
        }
    }

    saveToStorage() {
        const data = Array.from(this.goals.values());
        localStorage.setItem(`savings_v2_${this.currentUser.id}`, JSON.stringify(data));
    }

    createGoal(name, targetAmount, currency = 'USD') {
        const newGoal = {
            id: crypto.randomUUID(),
            name: name,
            targetDetails: {
                amount: this.sanitizeMoney(targetAmount),
                currency: currency,
                createdAt: new Date().toISOString()
            },
            state: {
                currentAmount: 0,
                progressPercentage: 0,
                version: 1 // Optimistic Lock start
            },
            ledger: []
        };
        this.goals.set(newGoal.id, newGoal);
        this.saveToStorage();
        return newGoal;
    }

    /**
     * Adds a transaction with Optimistic Locking check.
     * @param {string} goalId 
     * @param {number} amount 
     * @param {string} type 'DEPOSIT' | 'WITHDRAWAL'
     */
    async addTransaction(goalId, amount, type = 'DEPOSIT') {
        const goal = this.goals.get(goalId);
        if (!goal) throw new Error("Goal not found");

        const cleanAmount = this.sanitizeMoney(amount);
        const snapshotBefore = goal.state.currentAmount;
        
        // Calculate expected new state
        let newAmount = snapshotBefore;
        if (type === 'DEPOSIT') newAmount += cleanAmount;
        else if (type === 'WITHDRAWAL') newAmount -= cleanAmount;
        
        newAmount = this.sanitizeMoney(newAmount);

        const transaction = {
            id: crypto.randomUUID(),
            userId: this.currentUser.id,
            type: type,
            amount: cleanAmount,
            timestamp: new Date().toISOString(),
            snapshotBefore: snapshotBefore,
            snapshotAfter: newAmount,
            appliedVersion: goal.state.version // What version we think we are editing
        };

        // UI Optimistic Update
        this.applyTransactionLocal(goal, transaction);
        
        // Sync with Server (Simulation of conflict)
        try {
            const serverResponse = await this.backend.syncTransaction(goalId, transaction, goal.state.version);
            
            if (serverResponse.success) {
                // Server accepted, increment version confirmed
                goal.state.version = serverResponse.newVersion;
                this.saveToStorage();
                return { success: true, goal };
            } else {
                // CONFLICT DETECTED
                // Rollback local change
                this.rollbackLastTransaction(goal);
                
                // Return conflict data for UI resolution
                return { 
                    success: false, 
                    conflict: true, 
                    remoteState: serverResponse.latestGoal, 
                    localTransaction: transaction 
                };
            }
        } catch (err) {
            console.error("Sync failed, offline mode active", err);
            // In offline mode, we keep the optimistic update and mark as 'pending_sync'
            transaction.pending = true;
            this.saveToStorage();
            return { success: true, offline: true, goal };
        }
    }

    applyTransactionLocal(goal, transaction) {
        goal.ledger.push(transaction);
        goal.state.currentAmount = transaction.snapshotAfter;
        goal.state.progressPercentage = Math.min(
            (goal.state.currentAmount / goal.targetDetails.amount) * 100, 
            100
        );
        this.saveToStorage();
    }

    rollbackLastTransaction(goal) {
        const tx = goal.ledger.pop();
        if (tx) {
            goal.state.currentAmount = tx.snapshotBefore;
            // Recalculate progress
            goal.state.progressPercentage = Math.min(
                (goal.state.currentAmount / goal.targetDetails.amount) * 100, 
                100
            );
            this.saveToStorage();
        }
    }

    sanitizeMoney(val) {
        return Math.round(val * 100) / 100;
    }
    
    getGoal(id) {
        return this.goals.get(id);
    }
    
    getAllGoals() {
        return Array.from(this.goals.values());
    }
}

// Mock Backend for simulation if not connected
class MockSavingsBackend {
    constructor() {
        this.serverGoalsStr = localStorage.getItem('server_savings_db') || '{}';
        this.serverGoals = JSON.parse(this.serverGoalsStr);
    }

    // Simulate network delay and version checking
    async syncTransaction(goalId, transaction, clientVersion) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // 10% chance of conflict simulation for demo
                const forceConflict = Math.random() < 0.0; 
                
                let serverGoal = this.serverGoals[goalId];
                if (!serverGoal) {
                    // Init server goal if first sync
                    serverGoal = { state: { version: clientVersion } }; 
                    this.serverGoals[goalId] = serverGoal;
                }

                if (forceConflict || serverGoal.state.version > clientVersion) {
                    // Simulate a remote change happened
                    serverGoal.state.currentAmount += 100; 
                    serverGoal.state.version += 1;
                    
                    resolve({ 
                        success: false, 
                        newVersion: serverGoal.state.version,
                        latestGoal: serverGoal
                    });
                } else {
                    // Success
                    serverGoal.state.version = clientVersion + 1;
                    this.serverGoals[goalId] = serverGoal;
                    localStorage.setItem('server_savings_db', JSON.stringify(this.serverGoals));
                    
                    resolve({ 
                        success: true, 
                        newVersion: serverGoal.state.version 
                    });
                }
            }, 600);
        });
    }
}
