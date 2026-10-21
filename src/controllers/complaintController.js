import * as complaintService from "../services/complaintService.js";

export async function createHandler(req, res, next) {
  try {
    res.status(201).json(await complaintService.createComplaint(req.user, req.body));
  } catch (err) {
    next(err);
  }
}

export async function mineHandler(req, res, next) {
  try {
    const { page, limit, ...filters } = req.query;
    const result = await complaintService.listMine(req.user, {
      filters,
      pagination: { skip: (page - 1) * limit, take: limit },
    });
    res.json({ ...result, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function listHandler(req, res, next) {
  try {
    const { page, limit, ...filters } = req.query;
    const result = await complaintService.listComplaintsStaff({
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
    res.json(await complaintService.getComplaint(req.params.id, req.user));
  } catch (err) {
    next(err);
  }
}

export async function commentHandler(req, res, next) {
  try {
    res.status(201).json(await complaintService.addComment(req.params.id, req.user, req.body));
  } catch (err) {
    next(err);
  }
}

export async function statusHandler(req, res, next) {
  try {
    res.json(await complaintService.changeStatus(req.params.id, req.user, req.body));
  } catch (err) {
    next(err);
  }
}

export async function assignHandler(req, res, next) {
  try {
    res.json(await complaintService.assignComplaint(req.params.id, req.user, req.body));
  } catch (err) {
    next(err);
  }
}
