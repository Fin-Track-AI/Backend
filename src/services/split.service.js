import { SplitGroup } from '../models/splitGroup.model.js';
import { GroupExpense } from '../models/groupExpense.model.js';
import { Settlement } from '../models/settlement.model.js';

export class SplitService {
  /**
   * BR-16: Group Creation and Member-adding
   */
  async createGroup({ title, icon = '👥', members = [], createdBy }) {
    if (!title || !title.trim()) {
      throw new Error('Group title is required');
    }

    // Ensure createdBy is in members list
    const hasCreator = members.some((m) => m.memberId === createdBy || m.isCurrentUser);
    const finalMembers = hasCreator
      ? members
      : [
          {
            memberId: createdBy,
            name: 'You',
            isCurrentUser: true,
          },
          ...members,
        ];

    if (finalMembers.length < 2) {
      throw new Error('Please add at least 2 members to create a split group');
    }

    const group = await SplitGroup.create({
      title: title.trim(),
      icon: icon.trim() || '👥',
      createdBy,
      members: finalMembers,
    });

    return group;
  }

  async getGroupsByUser(userId) {
    return SplitGroup.find({
      $or: [{ createdBy: userId }, { 'members.memberId': userId }],
    }).sort({ updatedAt: -1 });
  }

  async getGroupById(groupId) {
    const group = await SplitGroup.findById(groupId);
    if (!group) {
      throw new Error('Group not found');
    }
    return group;
  }

  async addMemberToGroup(groupId, member) {
    const group = await this.getGroupById(groupId);

    const exists = group.members.some(
      (m) =>
        m.memberId === member.memberId ||
        m.name.toLowerCase() === member.name.toLowerCase()
    );

    if (exists) {
      throw new Error(`Member '${member.name}' is already in this group`);
    }

    group.members.push(member);
    await group.save();
    return group;
  }

  // ===========================================================================
  // BR-17: All 3 Split Methods (Equal, Percentage, Itemized) Reconcile to 100%
  // ===========================================================================

  /**
   * 1. Equal Split Calculation (reconciles 100% with penny/paise remainder balancing)
   */
  calculateEqualSplit({ totalAmount, members }) {
    if (!members || members.length === 0 || totalAmount <= 0) {
      throw new Error('Invalid members or total amount for equal split');
    }

    const count = members.length;
    const totalPaise = Math.round(totalAmount * 100);
    const basePaise = Math.floor(totalPaise / count);
    const remainderPaise = totalPaise % count;

    const allocations = members.map((m, idx) => {
      const memberPaise = basePaise + (idx < remainderPaise ? 1 : 0);
      const memberAmount = memberPaise / 100.0;
      const percentage = Number(((memberAmount / totalAmount) * 100).toFixed(2));

      return {
        memberId: m.memberId || m.id,
        memberName: m.name,
        amount: memberAmount,
        percentage,
      };
    });

    // Verify 100% reconciliation
    const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
    if (Math.abs(sum - totalAmount) > 0.001) {
      throw new Error('Equal split calculation failed to reconcile to 100%');
    }

    return allocations;
  }

  /**
   * 2. Percentage Split Calculation (reconciles 100% of original expense)
   */
  calculatePercentageSplit({ totalAmount, members, percentages }) {
    if (!members || members.length === 0 || totalAmount <= 0) {
      throw new Error('Invalid members or total amount for percentage split');
    }

    const totalPercent = Object.values(percentages).reduce(
      (acc, p) => acc + Number(p),
      0
    );

    if (Math.abs(totalPercent - 100.0) > 0.1) {
      throw new Error(
        `Total percentages must equal 100%. Currently received ${totalPercent.toFixed(1)}%`
      );
    }

    const totalPaise = Math.round(totalAmount * 100);
    let allocatedPaise = 0;

    const allocations = members.map((m, idx) => {
      const mid = m.memberId || m.id;
      const pct = Number(percentages[mid] || 0);

      let memberPaise;
      if (idx === members.length - 1) {
        memberPaise = totalPaise - allocatedPaise;
      } else {
        memberPaise = Math.round(totalAmount * (pct / 100.0) * 100);
        allocatedPaise += memberPaise;
      }

      const amount = memberPaise / 100.0;
      return {
        memberId: mid,
        memberName: m.name,
        amount,
        percentage: pct,
      };
    });

    return allocations;
  }

  /**
   * 3. Itemized Split Calculation (apportion per item + shared tax/tip to 100%)
   */
  calculateItemizedSplit({ totalAmount, items, members, taxAndTip = 0 }) {
    if (!members || members.length === 0) {
      throw new Error('Members required for itemized split');
    }
    if (!items || items.length === 0) {
      throw new Error('At least 1 item is required for itemized split');
    }

    const memberSubtotals = {};
    const memberItemNames = {};
    members.forEach((m) => {
      const mid = m.memberId || m.id;
      memberSubtotals[mid] = 0;
      memberItemNames[mid] = [];
    });

    let rawItemsTotal = 0;
    for (const item of items) {
      rawItemsTotal += Number(item.price);
      const assigned =
        item.assignedMemberIds && item.assignedMemberIds.length > 0
          ? item.assignedMemberIds
          : members.map((m) => m.memberId || m.id);

      const share = Number(item.price) / assigned.length;
      assigned.forEach((id) => {
        if (memberSubtotals[id] !== undefined) {
          memberSubtotals[id] += share;
          memberItemNames[id].push(item.name || item.itemName);
        }
      });
    }

    const grandTotal = totalAmount || (rawItemsTotal + Number(taxAndTip));
    const grandTotalPaise = Math.round(grandTotal * 100);
    let allocatedPaise = 0;

    const allocations = members.map((m, idx) => {
      const mid = m.memberId || m.id;
      const subtotal = memberSubtotals[mid] || 0;
      const proportion =
        rawItemsTotal > 0 ? subtotal / rawItemsTotal : 1.0 / members.length;
      const memberTaxTip = Number(taxAndTip) * proportion;
      const fullShare = subtotal + memberTaxTip;

      let memberPaise;
      if (idx === members.length - 1) {
        memberPaise = grandTotalPaise - allocatedPaise;
      } else {
        memberPaise = Math.round(fullShare * 100);
        allocatedPaise += memberPaise;
      }

      const finalAmount = memberPaise / 100.0;
      const pct = grandTotal > 0 ? (finalAmount / grandTotal) * 100 : 0;

      return {
        memberId: mid,
        memberName: m.name,
        amount: finalAmount,
        percentage: Number(pct.toFixed(2)),
        items: memberItemNames[mid],
      };
    });

    return allocations;
  }

  async addExpense({
    groupId,
    title,
    totalAmount,
    paidByMemberId,
    splitType,
    allocations,
    category = 'Food & Dining',
    notes = '',
    itemizedEntries = [],
  }) {
    const group = await this.getGroupById(groupId);
    const paidMember = group.members.find((m) => m.memberId === paidByMemberId) || group.members[0];

    // Validate allocations sum up to totalAmount within 1 cent/paise
    const sum = allocations.reduce((acc, a) => acc + Number(a.amount), 0);
    if (Math.abs(sum - totalAmount) > 0.05) {
      throw new Error(
        `Split allocations total (${sum}) must reconcile to 100% of expense amount (${totalAmount})`
      );
    }

    const expense = await GroupExpense.create({
      groupId,
      title: title.trim(),
      totalAmount: Number(totalAmount),
      paidByMemberId: paidMember.memberId,
      paidByMemberName: paidMember.isCurrentUser ? `${paidMember.name} (You)` : paidMember.name,
      splitType,
      allocations,
      category,
      notes,
      itemizedEntries,
    });

    return expense;
  }

  // ===========================================================================
  // BR-18: "Who owes whom" Net Balances & Debt Simplification Algorithm
  // ===========================================================================

  async getGroupBalancesAndSimplifiedDebts(groupId) {
    const group = await this.getGroupById(groupId);
    const expenses = await GroupExpense.find({ groupId });
    const settlements = await Settlement.find({ groupId, isSettled: true });
    const settledKeys = new Set(settlements.map((s) => s.debtKey));

    // 1. Calculate net balances
    const netBalances = {};
    group.members.forEach((m) => {
      netBalances[m.memberId] = 0;
    });

    for (const exp of expenses) {
      netBalances[exp.paidByMemberId] =
        (netBalances[exp.paidByMemberId] || 0) + exp.totalAmount;

      for (const a of exp.allocations) {
        netBalances[a.memberId] =
          (netBalances[a.memberId] || 0) - a.amount;
      }
    }

    // 2. Bipartite greedy debt simplification algorithm
    const debtors = [];
    const creditors = [];
    const memberMap = {};
    group.members.forEach((m) => {
      memberMap[m.memberId] = m;
    });

    Object.entries(netBalances).forEach(([memberId, balance]) => {
      const rounded = Number(balance.toFixed(2));
      if (rounded < -0.05) {
        debtors.push({ memberId, amount: Math.abs(rounded) });
      } else if (rounded > 0.05) {
        creditors.push({ memberId, amount: rounded });
      }
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const simplifiedDebts = [];
    let d = 0;
    let c = 0;

    while (d < debtors.length && c < creditors.length) {
      const debtor = debtors[d];
      const creditor = creditors[c];

      const settleAmount = Math.min(debtor.amount, creditor.amount);
      const roundedSettle = Number(settleAmount.toFixed(2));

      if (roundedSettle > 0.05) {
        const debtKey = `${groupId}_${debtor.memberId}_${creditor.memberId}`;
        const isSettled = settledKeys.has(debtKey);

        simplifiedDebts.push({
          id: debtKey,
          debtKey,
          groupId,
          fromMemberId: debtor.memberId,
          fromMemberName: memberMap[debtor.memberId]?.name || 'Unknown',
          toMemberId: creditor.memberId,
          toMemberName: memberMap[creditor.memberId]?.name || 'Unknown',
          amount: roundedSettle,
          isSettled,
          settlementNote: isSettled ? 'Settled via external UPI/Cash' : null,
        });
      }

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount < 0.05) d++;
      if (creditor.amount < 0.05) c++;
    }

    return {
      groupId,
      groupTitle: group.title,
      totalExpenses: expenses.length,
      totalGroupSpend: expenses.reduce((s, e) => s + e.totalAmount, 0),
      netBalances,
      simplifiedDebts,
      activeTransfersNeeded: simplifiedDebts.filter((s) => !s.isSettled).length,
    };
  }

  // ===========================================================================
  // BR-19: Non-Monetary Settlement Tracking & Gentle Reminders
  // ===========================================================================

  async markSettlement({
    groupId,
    debtKey,
    fromMemberId,
    fromMemberName,
    toMemberId,
    toMemberName,
    amount,
    settlementNote = 'Settled via external UPI/Cash (Non-monetary FinTrack ledger)',
    userId,
  }) {
    // Record external settlement confirmation (no in-app funds transferred)
    const settlement = await Settlement.findOneAndUpdate(
      { debtKey },
      {
        groupId,
        debtKey,
        fromMemberId,
        fromMemberName,
        toMemberId,
        toMemberName,
        amount: Number(amount),
        isSettled: true,
        settlementNote,
        settledByUserId: userId,
        settledAt: new Date(),
      },
      { upsert: true, returnDocument: 'after' }
    );

    return settlement;
  }

  generateReminderMessage({ groupTitle, debtorName, amount }) {
    const formattedAmount = `₹${Number(amount).toFixed(amount % 1 === 0 ? 0 : 2)}`;
    return `Hey ${debtorName}! 👋 FinTrack gentle nudge for your "${groupTitle}" share of ${formattedAmount}. Whenever you get a moment, settle up via UPI/Cash and let me know!`;
  }
}

export const splitService = new SplitService();
