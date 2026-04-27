/**
 * Split Algorithms for Payment Distribution
 */

/**
 * Calculate equal split among active participants
 * @param {Array} orders - List of orders with total_price and ordered_by
 * @param {Array} participants - List of participants with id and name
 * @returns {Object} Split result with strategy, total, and splits array
 */
function calculateEqualSplit(orders, participants) {
  if (participants.length === 0) return { error: 'No participants' };

  // Find who actually ordered something
  const whoOrdered = new Set();
  orders.forEach(o => {
    if (o.ordered_by) whoOrdered.add(o.ordered_by);
  });

  // Only split among people who placed orders
  const activeParticipants = whoOrdered.size > 0
    ? participants.filter(p => whoOrdered.has(p.id))
    : participants; // fallback: everyone if no ordered_by data

  if (activeParticipants.length === 0) {
    return { strategy: 'equal_split', total: 0, splits: participants.map(p => ({ participantId: p.id, name: p.name, amount: 0, items: [] })) };
  }

  const total = orders.reduce((sum, o) => sum + parseFloat(o.total_price), 0);
  const perPerson = Math.floor((total / activeParticipants.length) * 100) / 100;
  const remainder = Math.round((total - perPerson * activeParticipants.length) * 100) / 100;

  const splits = participants.map(p => {
    const isActive = activeParticipants.some(a => a.id === p.id);
    const idx = activeParticipants.findIndex(a => a.id === p.id);
    return {
      participantId: p.id,
      name: p.name,
      amount: isActive ? (idx === activeParticipants.length - 1 ? perPerson + remainder : perPerson) : 0,
      items: isActive ? orders.map(o => ({ orderId: o.id, name: o.name, amount: Math.round(parseFloat(o.total_price) / activeParticipants.length * 100) / 100 })) : []
    };
  });

  return { strategy: 'equal_split', total, splits };
}

/**
 * Calculate item-based split
 * @param {Array} orders - List of orders with id, total_price, and name
 * @param {Array} participants - List of participants with id and name
 * @param {Object} itemClaims - Map of order ID to array of participant IDs claiming that item
 * @returns {Object} Split result with strategy, total, and splits array
 */
function calculateItemBased(orders, participants, itemClaims) {
  const splits = {};
  participants.forEach(p => splits[p.id] = { participantId: p.id, name: p.name, amount: 0, items: [] });

  orders.forEach(order => {
    const claimants = itemClaims[order.id];
    const people = claimants && claimants.length > 0
      ? claimants.filter(id => splits[id])
      : participants.map(p => p.id);

    if (people.length === 0) return;

    const share = Math.round((parseFloat(order.total_price) / people.length) * 100) / 100;
    people.forEach(pid => {
      splits[pid].amount += share;
      splits[pid].items.push({ orderId: order.id, name: order.name, amount: share });
    });
  });

  const total = Object.values(splits).reduce((sum, s) => sum + s.amount, 0);

  return { strategy: 'item_based', total, splits: Object.values(splits) };
}

/**
 * Calculate individual debt - what each person owes for their own orders
 * @param {Array} orders - List of orders with total_price and ordered_by
 * @param {Array} participants - List of participants with id and name
 * @returns {Object} Split result with individual amounts
 */
function calculateIndividualOwed(orders, participants) {
  const splits = {};
  participants.forEach(p => splits[p.id] = { participantId: p.id, name: p.name, amount: 0, items: [] });

  orders.forEach(order => {
    if (order.ordered_by && splits[order.ordered_by]) {
      const amount = parseFloat(order.total_price);
      splits[order.ordered_by].amount += amount;
      splits[order.ordered_by].items.push({ orderId: order.id, name: order.name, amount });
    }
  });

  const total = Object.values(splits).reduce((sum, s) => sum + s.amount, 0);

  return { strategy: 'individual', total, splits: Object.values(splits) };
}

module.exports = {
  calculateEqualSplit,
  calculateItemBased,
  calculateIndividualOwed
};
