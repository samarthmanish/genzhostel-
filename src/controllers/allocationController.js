import * as allocationService from "../services/allocationService.js";

export async function createRequestHandler(req, res, next) {
  try {
    const allocation = await allocationService.createRequest(req.user, req.body);
    res.status(201).json(allocation);
  } catch (err) {
    next(err);
  }
}

export async function mineHandler(req, res, next) {
  try {
    res.json({ items: await allocationService.listMine(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function listHandler(req, res, next) {
  try {
    const { page, limit, ...filters } = req.query;
    const result = await allocationService.listAllocations({
      filters,
      actor: req.user,
      pagination: { skip: (page - 1) * limit, take: limit },
    });
    res.json({ ...result, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function getHandler(req, res, next) {
  try {
    res.json(await allocationService.getAllocation(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

export async function approveHandler(req, res, next) {
  try {
    res.json(await allocationService.approveAllocation(req.params.id, req.body, req.user));
  } catch (err) {
    next(err);
  }
}

export async function rejectHandler(req, res, next) {
  try {
    res.json(await allocationService.rejectAllocation(req.params.id, req.body, req.user));
  } catch (err) {
    next(err);
  }
}

export async function vacateHandler(req, res, next) {
  try {
    res.json(await allocationService.vacateAllocation(req.params.id, req.body, req.user));
  } catch (err) {
    next(err);
  }
}

export async function transferHandler(req, res, next) {
  try {
    res.json(await allocationService.transferAllocation(req.params.id, req.body, req.user));
  } catch (err) {
    next(err);
  }
}

export async function cancelHandler(req, res, next) {
  try {
    res.json(await allocationService.cancelRequest(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}
